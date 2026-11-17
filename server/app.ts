import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import crypto from 'crypto';
import { Prisma } from '../generated/prisma/client.ts';
import type { User } from '../generated/prisma/client.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { AppConfig } from './config.ts';
import type { ImageStorage } from './storage.ts';
import { errorHandler, HttpError } from './errors.ts';
import { routeSchemas, validate } from './validation.ts';
import { persistImage, readMultipartImage, resolveThumbnail } from './uploads.ts';
import { SEED_USER_IDS } from './seed.ts';
import { emailChangeAllowed, updateProfile } from './profile.ts';
import {
  courseInclude,
  toCategoryDoc,
  toCourseDoc,
  toEnrollmentDoc,
  toInquiryDoc,
  toMentorDoc,
  toNoteDoc,
  toUserDoc,
} from './mappers.ts';
import { hashPassword, newId, verifyPassword } from './password.ts';

export interface AppDependencies { prisma: PrismaClient; config: AppConfig; storage: ImageStorage }

/** Builds only the HTTP application; no listen, seed, migrations or Vite side effects. */
export function createApp({ prisma, config, storage }: AppDependencies) {
  const AUTH_SECRET = config.authSecret;
  const DEMO_MODE = config.demoMode;
  const databaseSchema = config.databaseSchema;
  const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  type UserRole = 'student' | 'instructor' | 'admin';
  const COURSE_LEVELS = ['Foundation', 'Intermediate', 'Principal'] as const;
  const COURSE_STATUSES = ['draft', 'pending', 'published'] as const;
  const schemas = routeSchemas(config);

  // ─── TOKENS ───────────────────────────────────────────────────────────────
  function signToken(userId: string): string {
    const payload = Buffer.from(
      JSON.stringify({ sub: userId, exp: Date.now() + TOKEN_TTL_MS })
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  function verifyToken(token: string): string | null {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
      if (typeof data.sub !== 'string' || typeof data.exp !== 'number') return null;
      if (data.exp < Date.now()) return null;
      return data.sub;
    } catch {
      return null;
    }
  }

  // ─── REQUEST HELPERS ──────────────────────────────────────────────────────
  type AuthedRequest = Request & { user?: User };

  /** Runs an async handler and forwards any thrown error to the error middleware. */
  const route =
    (fn: (req: AuthedRequest, res: Response) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
      fn(req as AuthedRequest, res).catch(next);
    };

  const isUniqueViolation = (err: unknown) =>
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  const isNotFound = (err: unknown) =>
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';

  /** Attaches req.user when a valid bearer token for an active user is present. */
  async function authenticate(req: AuthedRequest, _res: Response, next: NextFunction) {
    try {
      const header = req.headers.authorization || '';
      if (header.startsWith('Bearer ')) {
        const userId = verifyToken(header.slice(7));
        if (userId) {
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (user && user.status !== 'suspended' && (DEMO_MODE || !SEED_USER_IDS.includes(user.id))) req.user = user;
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  }

  function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    if (!req.user) {
      res.status(401).json({ error: 'Please sign in to continue.' });
      return;
    }
    next();
  }

  function requireRole(...roles: UserRole[]) {
    return (req: AuthedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        res.status(401).json({ error: 'Please sign in to continue.' });
        return;
      }
      if (!roles.includes(req.user.role)) {
        res.status(403).json({ error: 'You do not have permission to do that.' });
        return;
      }
      next();
    };
  }

  const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
  const strList = (v: unknown, max = 50, len = 300): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map((x) => x.slice(0, len))
      : [];

  // ─── COURSE HELPERS ───────────────────────────────────────────────────────
  /**
   * Courses the user may see. Lesson video URLs are only included for admins,
   * the course's instructor, and enrolled students; everyone else gets the
   * syllabus (titles, durations, ids) with videoUrl blanked.
   */
  async function listVisibleCourses(user?: User) {
    const isAdmin = user?.role === 'admin';
    const enrolledIds = new Set(
      user
        ? (
            await prisma.enrollment.findMany({
              where: { userId: user.id },
              select: { courseId: true },
            })
          ).map((e) => e.courseId)
        : []
    );
    const where: Prisma.CourseWhereInput = isAdmin
      ? {}
      : {
          OR: [
            { status: 'published' },
            ...(user ? [{ instructorId: user.id }, { id: { in: [...enrolledIds] } }] : []),
          ],
        };
    const rows = await prisma.course.findMany({
      where,
      include: courseInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((c) =>
      toCourseDoc(c, isAdmin || (!!user && (c.instructorId === user.id || enrolledIds.has(c.id))))
    );
  }

  /**
   * Validates client-supplied modules/lessons and assigns ids. Client ids are
   * kept (so progress and notes keep pointing at the same lessons) unless they
   * are missing, duplicated, or already used by a different course.
   */
  async function prepareModules(input: unknown, courseId: string | null) {
    const mods = (Array.isArray(input) ? input : []).slice(0, 100) as Record<string, any>[];
    const wantedModuleIds = mods.map((m) => str(m?._id)).filter(Boolean);
    const wantedLessonIds = mods
      .flatMap((m) => (Array.isArray(m?.lessons) ? m.lessons : []))
      .map((l: Record<string, unknown>) => str(l?._id))
      .filter(Boolean);

    const [takenModules, takenLessons] = await Promise.all([
      prisma.module.findMany({
        where: { id: { in: wantedModuleIds }, ...(courseId ? { NOT: { courseId } } : {}) },
        select: { id: true },
      }),
      prisma.lesson.findMany({
        where: {
          id: { in: wantedLessonIds },
          ...(courseId ? { NOT: { module: { courseId } } } : {}),
        },
        select: { id: true },
      }),
    ]);
    const takenM = new Set(takenModules.map((x) => x.id));
    const takenL = new Set(takenLessons.map((x) => x.id));
    const usedM = new Set<string>();
    const usedL = new Set<string>();
    const pickId = (raw: unknown, prefix: string, taken: Set<string>, used: Set<string>) => {
      const id =
        typeof raw === 'string' && raw && raw.length <= 100 && !taken.has(raw) && !used.has(raw)
          ? raw
          : newId(prefix);
      used.add(id);
      return id;
    };

    return mods.map((m, mi) => ({
      id: pickId(m?._id, 'mod', takenM, usedM),
      title: str(m?.title).slice(0, 200),
      position: mi,
      lessons: (Array.isArray(m?.lessons) ? m.lessons.slice(0, 200) : []).map(
        (l: Record<string, unknown>, li: number) => ({
          id: pickId(l?._id, 'les', takenL, usedL),
          title: str(l?.title).slice(0, 200),
          durationMinutes: Math.max(0, Math.round(Number(l?.durationMinutes) || 0)),
          videoUrl: str(l?.videoUrl).slice(0, 2000),
          summary: str(l?.summary).slice(0, 5000),
          keyTakeaways: strList(l?.keyTakeaways, 20, 500),
          position: li,
        })
      ),
    }));
  }

  type PreparedModules = Awaited<ReturnType<typeof prepareModules>>;

  function nestedModules(mods: PreparedModules) {
    return mods.map((m) => ({
      id: m.id,
      title: m.title,
      position: m.position,
      lessons: { create: m.lessons },
    }));
  }

  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", ...(config.nodeEnv === 'development' ? ["'unsafe-inline'"] : [])],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'blob:', 'https://res.cloudinary.com'],
      mediaSrc: ["'self'", ...config.videoOrigins], frameSrc: config.videoOrigins,
      connectSrc: ["'self'", ...(config.nodeEnv === 'development' ? ['ws:', 'wss:'] : [])],
      objectSrc: ["'none'"], frameAncestors: ["'self'"], formAction: ["'self'"],
      upgradeInsecureRequests: config.publicOrigin.startsWith('https:') ? [] : null,
    } },
    strictTransportSecurity: config.publicOrigin.startsWith('https:') ? undefined : false,
  }));
  // With direct connections, ignore spoofed forwarding headers without logging them.
  const limiter = (limit: number, windowMs: number, skipSuccessfulRequests = false) => rateLimit({ limit, windowMs, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests, validate: { xForwardedForHeader: config.trustProxy !== false }, message: { error: 'Too many requests. Please try again later.' } });
  const loginLimit = limiter(10, 15 * 60_000, true);
  const signupLimit = limiter(20, 60 * 60_000);
  const inquiryLimit = limiter(10, 15 * 60_000);
  const uploadLimit = limiter(20, 15 * 60_000);
  const profileLimit = limiter(20, 15 * 60_000);
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== config.publicOrigin) return next(new HttpError(403, 'This request origin is not allowed.'));
    next();
  });
  app.use('/api', authenticate);
  app.use('/api', express.json({ limit: '100kb' }));
  app.param('id', (req, _res, next, value) => {
    if (!schemas.params.safeParse({ id: value }).success) return next(new HttpError(400, 'Invalid record id.'));
    next();
  });
  if (storage.provider === 'local') {
    app.use('/uploads', (req, _res, next) => {
      if (!/^\/upl_[a-f0-9]{32}\.webp$/.test(req.path)) return next(new HttpError(404, 'Image not found.'));
      next();
    }, express.static(config.uploadDir, { dotfiles: 'deny', index: false, redirect: false, maxAge: '1y', immutable: true }));
    app.use('/uploads', (_req, _res, next) => next(new HttpError(404, 'Image not found.')));
  }
  let activeUploads = 0;
  const receiveImage = (maxDimension: 512 | 1920) => route(async (req, res) => {
    if (activeUploads >= 2) throw new HttpError(429, 'Uploads are busy. Please retry shortly.');
    activeUploads++;
    try { const bytes = await readMultipartImage(req); res.status(201).json(await persistImage(prisma, storage, req.user!.id, bytes, maxDimension)); }
    finally { activeUploads--; }
  });
  app.post('/api/uploads', requireRole('instructor', 'admin'), uploadLimit, receiveImage(1920));
  app.post('/api/profile/avatar', requireAuth, uploadLimit, receiveImage(512));
  app.get('/api/profile', requireAuth, route(async (req, res) => {
    res.json({ user: toUserDoc(req.user!), emailChangeAllowed: emailChangeAllowed(req.user!.id) });
  }));
  app.patch('/api/profile', requireAuth, profileLimit, validate(schemas.profile), route(async (req, res) => {
    const user = await updateProfile(prisma, databaseSchema, req.user!.id, req.body);
    res.json({ user: toUserDoc(user), emailChangeAllowed: emailChangeAllowed(user.id) });
  }));

  app.get(
    '/api/health',
    route(async (_req, res) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ ok: true });
      } catch {
        res.status(503).json({ ok: false });
      }
    })
  );

  // ─── AUTHENTICATION API ─────────────────────────────────────────────────
  app.post(
    '/api/auth/login',
    loginLimit,
    validate(schemas.login),
    route(async (req, res) => {
      const { email, password } = req.body as { email?: string; password?: string };

      if (!email?.trim() || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
      });

      if (!user || (!DEMO_MODE && SEED_USER_IDS.includes(user.id)) || !verifyPassword(password, user.password)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }
      if (user.status === 'suspended') {
        res.status(403).json({ error: 'This account has been suspended by an administrator.' });
        return;
      }

      res.json({ user: toUserDoc(user), token: signToken(user.id) });
    })
  );

  app.post(
    '/api/auth/signup',
    signupLimit,
    validate(schemas.signup),
    route(async (req, res) => {
      const { name, email, password, role, title, bio } = req.body as {
        name?: string;
        email?: string;
        password?: string;
        role?: UserRole;
        title?: string;
        bio?: string;
      };

      if (
        !name?.trim() ||
        !email?.trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        !password ||
        password.length < 8
      ) {
        res.status(400).json({
          error: 'Name, a valid email, and a password of at least 8 characters are required.',
        });
        return;
      }

      // Self-signup can never create an admin.
      const assignedRole: UserRole = role === 'instructor' ? 'instructor' : 'student';

      try {
        const newUser = await prisma.user.create({
          data: {
            id: newId('usr'),
            name: name.trim().slice(0, 100),
            email: email.trim().toLowerCase(),
            password: hashPassword(password),
            role: assignedRole,
            title:
              title?.trim().slice(0, 100) ||
              (assignedRole === 'instructor' ? 'Faculty Instructor' : 'Software Engineer'),
            bio:
              bio?.trim().slice(0, 500) ||
              'Building production systems and mastering technical architecture.',
            avatar:
              assignedRole === 'instructor'
                ? '/images/mentor_portrait_lead_1794504817874.jpg'
                : '/images/hero_floating_mentor_card_1794504815575.jpg',
          },
        });
        res.status(201).json({ user: toUserDoc(newUser), token: signToken(newUser.id) });
      } catch (err) {
        if (isUniqueViolation(err)) {
          res.status(409).json({
            error: 'An account with this email already exists. Please sign in.',
          });
          return;
        }
        throw err;
      }
    })
  );

  // ─── GET /api/bootstrap (data is filtered by who is asking) ─────────────
  app.get(
    '/api/bootstrap',
    route(async (req, res) => {
      const user = req.user;
      const isAdmin = user?.role === 'admin';

      const [categories, mentors, courses] = await Promise.all([
        prisma.category.findMany({ orderBy: { createdAt: 'asc' } }),
        prisma.mentor.findMany({ orderBy: { position: 'asc' } }),
        listVisibleCourses(user),
      ]);

      let users: ReturnType<typeof toUserDoc>[] = [];
      let enrollments: ReturnType<typeof toEnrollmentDoc>[] = [];
      let notes: ReturnType<typeof toNoteDoc>[] = [];
      let inquiries: ReturnType<typeof toInquiryDoc>[] = [];

      if (user) {
        const [allUsers, enrollmentRows, noteRows, inquiryRows] = await Promise.all([
          isAdmin ? prisma.user.findMany({ orderBy: { joinedAt: 'asc' } }) : Promise.resolve([user]),
          prisma.enrollment.findMany({
            where: isAdmin
              ? {}
              : { OR: [{ userId: user.id }, { course: { instructorId: user.id } }] },
            orderBy: { enrolledAt: 'desc' },
          }),
          prisma.note.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
          isAdmin
            ? prisma.inquiry.findMany({ orderBy: { createdAt: 'desc' } })
            : Promise.resolve([]),
        ]);
        users = allUsers.map(toUserDoc);
        enrollments = enrollmentRows.map(toEnrollmentDoc);
        notes = noteRows.map(toNoteDoc);
        inquiries = inquiryRows.map(toInquiryDoc);
      }

      res.json({
        categories: categories.map(toCategoryDoc),
        mentors: mentors.map(toMentorDoc),
        courses,
        users,
        enrollments,
        notes,
        inquiries,
        me: user ? toUserDoc(user) : null,
        demoMode: DEMO_MODE,
        paymentsMode: config.paymentsMode,
      });
    })
  );

  // ─── CATEGORIES API ─────────────────────────────────────────────────────
  app.get(
    '/api/categories',
    route(async (_req, res) => {
      const rows = await prisma.category.findMany({ orderBy: { createdAt: 'asc' } });
      res.json(rows.map(toCategoryDoc));
    })
  );

  app.post(
    '/api/categories',
    requireRole('instructor', 'admin'),
    validate(schemas.category),
    route(async (req, res) => {
      const { name, description } = req.body as { name?: string; description?: string };

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Category name is required.' });
        return;
      }

      const normalizedName = name.trim().slice(0, 80);
      const existing = await prisma.category.findFirst({
        where: { name: { equals: normalizedName, mode: 'insensitive' } },
      });
      if (existing) {
        res.status(409).json({ error: 'Category already exists.', category: toCategoryDoc(existing) });
        return;
      }

      try {
        const created = await prisma.category.create({
          data: {
            id: newId('cat'),
            name: normalizedName,
            description:
              description?.trim().slice(0, 300) ||
              `Practitioner-led courses and technical mastery in ${normalizedName}.`,
            createdByRole: req.user!.role,
          },
        });
        res.status(201).json(toCategoryDoc(created));
      } catch (err) {
        if (isUniqueViolation(err)) {
          res.status(409).json({ error: 'Category already exists.' });
          return;
        }
        throw err;
      }
    })
  );

  app.delete(
    '/api/categories/:id',
    requireRole('admin'),
    route(async (req, res) => {
      try {
        await prisma.category.delete({ where: { id: String(req.params.id) } });
        res.json({ success: true });
      } catch (err) {
        if (isNotFound(err)) {
          res.status(404).json({ error: 'Category not found.' });
          return;
        }
        throw err;
      }
    })
  );

  // ─── COURSES API ────────────────────────────────────────────────────────
  app.get(
    '/api/courses',
    route(async (req, res) => {
      res.json(await listVisibleCourses(req.user));
    })
  );

  app.post(
    '/api/courses',
    requireRole('instructor', 'admin'),
    validate(schemas.courseCreate),
    route(async (req, res) => {
      const payload = req.body as Record<string, unknown>;
      const title = str(payload.title).trim();
      const category = str(payload.category).trim();
      if (!title || !category) {
        res.status(400).json({ error: 'Course title and category are required.' });
        return;
      }

      const user = req.user!;

      // Instructors always author as themselves; admins may set the author.
      let author: User = user;
      if (user.role === 'admin' && typeof payload.instructorId === 'string') {
        author = (await prisma.user.findUnique({ where: { id: payload.instructorId } })) || user;
      }

      const courseId = newId('crs');
      const modules = await prepareModules(payload.modules, null);

      const existingCategory = await prisma.category.findFirst({
        where: { name: { equals: category, mode: 'insensitive' } },
      });
      if (!existingCategory) {
        await prisma.category
          .create({
            data: {
              id: newId('cat'),
              name: category.slice(0, 80),
              description: `Practitioner-led courses in ${category}.`,
              createdByRole: user.role,
            },
          })
          .catch((err) => {
            if (!isUniqueViolation(err)) throw err; // created concurrently: fine
          });
      }

      const level = COURSE_LEVELS.includes(payload.level as never)
        ? (payload.level as (typeof COURSE_LEVELS)[number])
        : 'Intermediate';

      const course = await prisma.$transaction(async (tx) => {
        const cover = await resolveThumbnail(tx, databaseSchema, user, payload);
        return tx.course.create({
        data: {
          id: courseId,
          title: title.slice(0, 200),
          subtitle: str(payload.subtitle).trim().slice(0, 500),
          category: category.slice(0, 80),
          level,
          price: Math.max(0, Math.round(Number(payload.price) || 0)),
          durationHours: Math.max(0, Number(payload.durationHours) || 1),
          studentsCount: 0,
          thumbnail: '',
          ...cover,
          instructorId: author.id,
          instructorSignature: str(payload.instructorSignature).slice(0, 100) || author.name,
          // Always require Admin approval before a new course is published
          status: 'pending',
          featured: false,
          skills: strList(payload.skills),
          outcomes: strList(payload.outcomes),
          modules: { create: nestedModules(modules) },
        },
        include: courseInclude,
        });
      });

      const categories = await prisma.category.findMany({ orderBy: { createdAt: 'asc' } });
      res.status(201).json({
        course: toCourseDoc(course, true),
        categories: categories.map(toCategoryDoc),
      });
    })
  );

  app.put(
    '/api/courses/:id',
    requireRole('instructor', 'admin'),
    validate(schemas.courseEdit),
    route(async (req, res) => {
      const user = req.user!;
      const isAdmin = user.role === 'admin';
      const id = String(req.params.id);
      const existing = await prisma.course.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      if (!isAdmin && existing.instructorId !== user.id) {
        res.status(403).json({ error: 'You can only edit your own courses.' });
        return;
      }

      // Whitelist: only these fields can be changed through this endpoint.
      const b = req.body as Record<string, unknown>;
      const data: Prisma.CourseUncheckedUpdateInput = {};
      if (typeof b.title === 'string' && b.title.trim()) data.title = b.title.trim().slice(0, 200);
      if (typeof b.subtitle === 'string') data.subtitle = b.subtitle.trim().slice(0, 500);
      if (typeof b.category === 'string' && b.category.trim()) data.category = b.category.trim().slice(0, 80);
      if (COURSE_LEVELS.includes(b.level as never)) data.level = b.level as (typeof COURSE_LEVELS)[number];
      if (b.price !== undefined && Number.isFinite(Number(b.price))) {
        data.price = Math.max(0, Math.round(Number(b.price)));
      }
      if (b.durationHours !== undefined && Number(b.durationHours) > 0) {
        data.durationHours = Number(b.durationHours);
      }
      if (typeof b.instructorSignature === 'string') {
        data.instructorSignature = b.instructorSignature.slice(0, 100);
      }
      if (b.skills !== undefined) data.skills = strList(b.skills);
      if (b.outcomes !== undefined) data.outcomes = strList(b.outcomes);

      if (isAdmin) {
        if (COURSE_STATUSES.includes(b.status as never)) {
          data.status = b.status as (typeof COURSE_STATUSES)[number];
        }
        if (typeof b.featured === 'boolean') data.featured = b.featured;
        if (b.studentsCount !== undefined && Number.isFinite(Number(b.studentsCount))) {
          data.studentsCount = Math.max(0, Math.round(Number(b.studentsCount)));
        }
        if (typeof b.instructorId === 'string' && b.instructorId !== existing.instructorId) {
          const author = await prisma.user.findUnique({ where: { id: b.instructorId } });
          if (author) {
            data.instructorId = author.id;
          }
        }
      } else if (b.status === 'draft' || b.status === 'pending') {
        // Instructors can't self-publish, feature, reassign, or fake stats.
        data.status = b.status;
      }

      const modules = b.modules !== undefined ? await prepareModules(b.modules, id) : null;

      const updated = await prisma.$transaction(async (tx) => {
        Object.assign(data, await resolveThumbnail(tx, databaseSchema, user, b, existing));
        if (modules) {
          await tx.module.deleteMany({ where: { courseId: id } }); // lessons cascade
          await tx.module.createMany({
            data: modules.map((m) => ({ id: m.id, courseId: id, title: m.title, position: m.position })),
          });
          await tx.lesson.createMany({
            data: modules.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleId: m.id }))),
          });
        }
        return tx.course.update({ where: { id }, data, include: courseInclude });
      });

      res.json(toCourseDoc(updated, true));
    })
  );

  app.delete(
    '/api/courses/:id',
    requireRole('instructor', 'admin'),
    route(async (req, res) => {
      const user = req.user!;
      const id = String(req.params.id);
      const course = await prisma.course.findUnique({ where: { id } });
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      if (user.role !== 'admin' && course.instructorId !== user.id) {
        res.status(403).json({ error: 'You can only delete your own courses.' });
        return;
      }
      const enrolled = await prisma.enrollment.count({ where: { courseId: id } });
      if (enrolled > 0) {
        res.status(409).json({
          error:
            'This course has enrolled students and cannot be deleted. Unpublish it (set it to draft) instead.',
        });
        return;
      }
      await prisma.course.delete({ where: { id } }); // modules, lessons, notes cascade
      res.json({ success: true });
    })
  );

  // ─── ENROLLMENTS & PROGRESS API ─────────────────────────────────────────
  app.post(
    '/api/enrollments',
    requireAuth,
    validate(schemas.enrollment),
    route(async (req, res) => {
      const { courseId } = req.body as { courseId?: string };
      const user = req.user!;

      if (!courseId || typeof courseId !== 'string') {
        res.status(400).json({ error: 'courseId is required.' });
        return;
      }

      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || course.status !== 'published') {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }

      const existing = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId } },
      });
      if (existing) {
        res.json(toEnrollmentDoc(existing));
        return;
      }

      // Demo accounts and mock payment behavior are independent settings.
      if (course.price > 0 && config.paymentsMode !== 'mock') {
        res.status(402).json({
          error: 'Paid enrollment is not available yet. Payments are not configured.',
        });
        return;
      }

      try {
        const enrollment = await prisma.$transaction(async (tx) => {
          const courseTable = Prisma.raw(`"${databaseSchema.replace(/"/g, '""')}"."Course"`);
          await tx.$queryRaw`SELECT id FROM ${courseTable} WHERE id = ${courseId} FOR UPDATE`;
          const current = await tx.course.findUnique({ where: { id: courseId } });
          if (!current || current.status !== 'published') throw new HttpError(404, 'Course not found.');
          if (current.price > 0 && config.paymentsMode !== 'mock') throw new HttpError(402, 'Paid enrollment is not available yet. Payments are not configured.');
          const created = await tx.enrollment.create({
            data: {
              id: newId('enr'),
              userId: user.id,
              courseId,
              // Payments are simulated: the amount always comes from the course price.
              amountPaid: current.price,
              paymentRef: `${current.price > 0 ? 'MOCK' : 'FREE'}-${crypto.randomUUID()}`,
              paymentMode: current.price > 0 ? 'mock' : 'free',
              completedLessonIds: [],
              progressPercent: 0,
            },
          });
          await tx.course.update({
            where: { id: courseId },
            data: { studentsCount: { increment: 1 } },
          });
          return created;
        });
        res.status(201).json(toEnrollmentDoc(enrollment));
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Double-submit race: the other request won. Return its enrollment.
          const winner = await prisma.enrollment.findUnique({
            where: { userId_courseId: { userId: user.id, courseId } },
          });
          if (winner) {
            res.json(toEnrollmentDoc(winner));
            return;
          }
        }
        throw err;
      }
    })
  );

  app.patch(
    '/api/enrollments/:id/progress',
    requireAuth,
    validate(schemas.progress),
    route(async (req, res) => {
      const { lessonId } = req.body as { lessonId?: unknown };
      const enrollmentId = String(req.params.id);
      const userId = req.user!.id;

      type Outcome =
        | { error: string; status: number }
        | { enrollment: Awaited<ReturnType<typeof prisma.enrollment.update>> };

      const outcome: Outcome = await prisma.$transaction(async (tx) => {
        // Lock the row so two quick toggles can't overwrite each other.
        const enrollmentTable = Prisma.raw(`"${databaseSchema.replace(/"/g, '""')}"."Enrollment"`);
        await tx.$queryRaw`SELECT id FROM ${enrollmentTable} WHERE id = ${enrollmentId} FOR UPDATE`;
        const enrollment = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
        if (!enrollment || enrollment.userId !== userId) {
          return { error: 'Enrollment not found.', status: 404 };
        }

        // Only lessons that actually belong to this course can be completed.
        const lessons = await tx.lesson.findMany({
          where: { module: { courseId: enrollment.courseId } },
          select: { id: true },
        });
        const validLessonIds = new Set(lessons.map((l) => l.id));
        if (typeof lessonId !== 'string' || !validLessonIds.has(lessonId)) {
          return { error: 'Lesson does not belong to this course.', status: 400 };
        }

        // Drop any stale/bogus ids saved earlier, then toggle this one.
        let completed = [...new Set(enrollment.completedLessonIds)].filter((id) => validLessonIds.has(id));
        completed = completed.includes(lessonId)
          ? completed.filter((id) => id !== lessonId)
          : [...completed, lessonId];

        const allComplete = completed.length === validLessonIds.size;
        const progressPercent = allComplete
          ? 100
          : Math.min(99, Math.round((completed.length / validLessonIds.size) * 100));

        return {
          enrollment: await tx.enrollment.update({
            where: { id: enrollmentId },
            data: {
              completedLessonIds: completed,
              progressPercent,
              ...(allComplete && !enrollment.certificateIssuedAt
                ? { certificateIssuedAt: new Date() }
                : {}),
            },
          }),
        };
      });

      if ('error' in outcome) {
        res.status(outcome.status).json({ error: outcome.error });
        return;
      }
      res.json(toEnrollmentDoc(outcome.enrollment));
    })
  );

  // ─── STUDENT NOTES API ──────────────────────────────────────────────────
  app.post(
    '/api/notes',
    requireAuth,
    validate(schemas.note),
    route(async (req, res) => {
      const { courseId, lessonId, lessonTitle, timestampFormatted, content } = req.body as Record<
        string,
        unknown
      >;

      if (
        typeof courseId !== 'string' ||
        typeof lessonId !== 'string' ||
        typeof content !== 'string' ||
        !content.trim()
      ) {
        res.status(400).json({ error: 'Note content and lesson context are required.' });
        return;
      }

      const lesson = await prisma.lesson.findFirst({
        where: { id: lessonId, module: { courseId } },
        select: { id: true },
      });
      if (!lesson) {
        res.status(400).json({ error: 'Lesson does not belong to this course.' });
        return;
      }

      if (req.user!.role !== 'admin') {
        const access = await prisma.course.findFirst({
          where: {
            id: courseId,
            OR: [
              { instructorId: req.user!.id },
              { enrollments: { some: { userId: req.user!.id } } },
            ],
          },
          select: { id: true },
        });
        if (!access) {
          res.status(403).json({ error: 'Enroll in this course before adding notes.' });
          return;
        }
      }

      const note = await prisma.note.create({
        data: {
          id: newId('not'),
          userId: req.user!.id,
          courseId,
          lessonId,
          lessonTitle: str(lessonTitle).slice(0, 200) || 'Lesson Note',
          timestampFormatted: str(timestampFormatted).slice(0, 20) || '00:00',
          content: content.trim().slice(0, 5000),
        },
      });
      res.status(201).json(toNoteDoc(note));
    })
  );

  app.delete(
    '/api/notes/:id',
    requireAuth,
    route(async (req, res) => {
      const note = await prisma.note.findUnique({ where: { id: String(req.params.id) } });
      if (note) {
        if (note.userId !== req.user!.id && req.user!.role !== 'admin') {
          res.status(403).json({ error: 'You can only delete your own notes.' });
          return;
        }
        await prisma.note.delete({ where: { id: note.id } });
      }
      res.json({ success: true });
    })
  );

  // ─── ADMIN GOVERNANCE API ───────────────────────────────────────────────
  app.patch(
    '/api/users/:id',
    requireRole('admin'),
    validate(schemas.user),
    route(async (req, res) => {
      const { role, status } = req.body as {
        role?: UserRole;
        status?: 'active' | 'suspended';
      };
      if (role && !['student', 'instructor', 'admin'].includes(role)) {
        res.status(400).json({ error: 'Invalid role.' });
        return;
      }
      if (status && !['active', 'suspended'].includes(status)) {
        res.status(400).json({ error: 'Invalid status.' });
        return;
      }
      const id = String(req.params.id);
      if (id === req.user!.id && (role || status)) {
        res.status(400).json({ error: 'You cannot change your own role or status.' });
        return;
      }
      try {
        const updated = await prisma.user.update({
          where: { id },
          data: { ...(role ? { role } : {}), ...(status ? { status } : {}) },
        });
        res.json(toUserDoc(updated));
      } catch (err) {
        if (isNotFound(err)) {
          res.status(404).json({ error: 'User not found.' });
          return;
        }
        throw err;
      }
    })
  );

  app.post(
    '/api/inquiries',
    inquiryLimit,
    validate(schemas.inquiry),
    route(async (req, res) => {
      const { name, email, topic, message } = req.body as Record<string, unknown>;
      if (
        typeof name !== 'string' || !name.trim() ||
        typeof email !== 'string' || !email.trim() ||
        typeof message !== 'string' || !message.trim()
      ) {
        res.status(400).json({ error: 'Name, email, and message are required.' });
        return;
      }

      const inquiry = await prisma.inquiry.create({
        data: {
          id: newId('inq'),
          name: name.trim().slice(0, 100),
          email: email.trim().slice(0, 200),
          topic: str(topic).trim().slice(0, 200) || 'Curriculum & Admissions Inquiry',
          message: message.trim().slice(0, 5000),
        },
      });
      res.status(201).json(toInquiryDoc(inquiry));
    })
  );

  app.patch(
    '/api/inquiries/:id',
    requireRole('admin'),
    validate(schemas.empty),
    route(async (req, res) => {
      const id = String(req.params.id);
      const inquiry = await prisma.inquiry.findUnique({ where: { id } });
      if (!inquiry) {
        res.status(404).json({ error: 'Inquiry not found.' });
        return;
      }
      const updated = await prisma.inquiry.update({
        where: { id },
        data: { status: inquiry.status === 'new' ? 'reviewed' : 'new' },
      });
      res.json(toInquiryDoc(updated));
    })
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  app.use(errorHandler);
  return app;
}
