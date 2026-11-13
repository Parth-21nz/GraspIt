import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  CategoryDocument,
  CourseDocument,
  EnrollmentDocument,
  InquiryDocument,
  LessonNoteDocument,
  MentorProfile,
  UserDocument,
  UserRole,
} from './src/types.ts';

interface GraspItDatabase {
  users: UserDocument[];
  categories: CategoryDocument[];
  courses: CourseDocument[];
  enrollments: EnrollmentDocument[];
  notes: LessonNoteDocument[];
  inquiries: InquiryDocument[];
  mentors: MentorProfile[];
}

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'graspit-db.json');

const SEED_DATA: GraspItDatabase = {
  users: [
    {
      _id: 'usr_student_01',
      name: 'Elena Vance',
      email: 'student@graspit.dev',
      password: 'password123',
      role: 'student',
      title: 'Senior Frontend Engineer',
      bio: 'Transitioning into distributed AI systems and design engineering leadership.',
      avatar: '/images/hero_floating_mentor_card_1794504815575.jpg',
      status: 'active',
      joinedAt: '2026-02-14T10:00:00Z',
    },
    {
      _id: 'usr_instructor_01',
      name: 'Marcus Sterling',
      email: 'instructor@graspit.dev',
      password: 'password123',
      role: 'instructor',
      title: 'Principal Systems Architect',
      bio: '15+ years leading distributed inference pipelines and high-throughput compute engines.',
      avatar: '/images/mentor_portrait_lead_1794504817874.jpg',
      status: 'active',
      joinedAt: '2025-09-01T08:30:00Z',
    },
    {
      _id: 'usr_instructor_02',
      name: 'Sora Takahashi',
      email: 'sora.takahashi@graspit.dev',
      password: 'password123',
      role: 'instructor',
      title: 'Staff Design Systems Lead',
      bio: 'Architecting multi-brand token systems, micro-interaction engines, and accessible component primitives.',
      avatar: '/images/course_design_engineering_1794504816433.jpg',
      status: 'active',
      joinedAt: '2025-10-12T09:15:00Z',
    },
    {
      _id: 'usr_admin_01',
      name: 'Devon Kael',
      email: 'admin@graspit.dev',
      password: 'password123',
      role: 'admin',
      title: 'VP of Curriculum & Platform Governance',
      bio: 'Overseeing academic rigor, mentor accreditation, and enterprise cohort operations.',
      avatar: '/images/hero_collaborative_study_1794504814432.jpg',
      status: 'active',
      joinedAt: '2025-06-01T00:00:00Z',
    },
  ],
  categories: [
    {
      _id: 'cat_ai',
      name: 'AI',
      slug: 'ai',
      description: 'LLM inference optimization, agent orchestration, and neural compute systems.',
      createdByRole: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      _id: 'cat_tech',
      name: 'Tech',
      slug: 'tech',
      description: 'Distributed backend engineering, TypeScript architecture, and cloud-native scalability.',
      createdByRole: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      _id: 'cat_design',
      name: 'Design',
      slug: 'design',
      description: 'Design engineering, typographic hierarchy, token systems, and motion physics.',
      createdByRole: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      _id: 'cat_product',
      name: 'Product Engineering',
      slug: 'product-engineering',
      description: 'End-to-end full-stack product delivery, telemetry rigor, and conversion architecture.',
      createdByRole: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
  mentors: [
    {
      _id: 'mnt_01',
      name: 'Marcus Sterling',
      role: 'Principal AI & Distributed Systems Architect',
      organization: 'Ex-Core Compute Lead',
      signatureQuote: 'Master the underlying machine before abstracting the layer.',
      bio: 'Led low-latency inference clusters serving 40M+ daily active requests. Teaches practical kernel-to-API engineering.',
      avatar: '/images/mentor_portrait_lead_1794504817874.jpg',
      specialties: ['CUDA & Inference', 'Distributed Systems', 'TypeScript Runtimes'],
      studentsMentored: '4,280+',
      coursesCount: 3,
    },
    {
      _id: 'mnt_02',
      name: 'Sora Takahashi',
      role: 'Staff Design Engineer & Typography Director',
      organization: 'Studio Obsidian',
      signatureQuote: 'Precision in spacing and contrast is the clearest form of respect for the user.',
      bio: 'Built mission-critical design systems and dark-room editorial interfaces for global engineering teams.',
      avatar: '/images/hero_floating_mentor_card_1794504815575.jpg',
      specialties: ['Design Systems', 'CSS Architecture', 'WebGL & Motion'],
      studentsMentored: '3,610+',
      coursesCount: 2,
    },
    {
      _id: 'mnt_03',
      name: 'Vikramjit Rao',
      role: 'VP of Product Engineering',
      organization: 'Vertex Cloud',
      signatureQuote: 'Great product engineers bridge database internals and human perception.',
      bio: 'Scaled full-stack TypeScript and MERN architectures from seed stage to ₹1,000Cr+ ARR enterprise platforms.',
      avatar: '/images/hero_collaborative_study_1794504814432.jpg',
      specialties: ['MERN & TypeScript', 'System Design', 'Product Velocity'],
      studentsMentored: '2,890+',
      coursesCount: 2,
    },
  ],
  courses: [
    {
      _id: 'crs_01',
      title: 'Production AI Inference & Agentic Systems Architecture',
      subtitle: 'Architect fault-tolerant retrieval pipelines, streaming tool-use runtimes, and sub-100ms evaluation harnesses.',
      slug: 'production-ai-inference-agentic-systems',
      category: 'AI',
      level: 'Principal',
      price: 2500,
      durationHours: 18,
      rating: 4.9,
      studentsCount: 3420,
      thumbnail: '/images/course_ai_systems_1794504816295.jpg',
      instructorId: 'usr_instructor_01',
      instructorName: 'Marcus Sterling',
      instructorRole: 'Principal Systems Architect',
      instructorSignature: 'Marcus Sterling',
      instructorAvatar: '/images/mentor_portrait_lead_1794504817874.jpg',
      status: 'published',
      featured: true,
      skills: ['LLM Orchestration', 'Vector Indexing', 'Streaming Protocols', 'Eval Harnesses'],
      outcomes: [
        'Deploy deterministic multi-step agent loops with strict schema validation',
        'Cut p99 token streaming latency by 42% using speculative caching',
        'Build automated regression suites for enterprise AI workflows',
      ],
      modules: [
        {
          _id: 'mod_01_1',
          title: '01. Token Streaming & Low-Latency Transport',
          lessons: [
            {
              _id: 'les_01_1_1',
              title: 'SSE vs. WebSockets for High-Concurrency Inference',
              durationMinutes: 28,
              videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
              summary: 'Deep dive into backpressure handling, chunk framing, and token buffer flushing in Node.js and TypeScript.',
              keyTakeaways: [
                'Always enforce bounded memory queues per active stream',
                'Use structured JSON envelope framing for partial tool calls',
              ],
            },
            {
              _id: 'les_01_1_2',
              title: 'Semantic Caching & Prefix KV Reuse',
              durationMinutes: 34,
              videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
              summary: 'Structuring system prompts and deterministic context blocks to maximize cache hit ratios.',
              keyTakeaways: [
                'Place static schema definitions before dynamic user context',
                'Measure cache hit telemetry across multi-turn sessions',
              ],
            },
          ],
        },
        {
          _id: 'mod_01_2',
          title: '02. Deterministic Tool Routing & Guardrails',
          lessons: [
            {
              _id: 'les_01_2_1',
              title: 'State-Machine Driven Function Execution',
              durationMinutes: 42,
              videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
              summary: 'Isolating side-effecting tool invocations behind idempotent state transitions and retry budgets.',
              keyTakeaways: [
                'Separate read-only query tools from state-mutating actions',
                'Attach idempotency keys to every external API invocation',
              ],
            },
          ],
        },
      ],
      updatedAt: '2026-10-18T12:00:00Z',
    },
    {
      _id: 'crs_02',
      title: 'Design Engineering: Token Systems & Editorial Interfaces',
      subtitle: 'Build razor-sharp dark-mode design systems, optical typography scales, and compositor-driven motion in React.',
      slug: 'design-engineering-token-systems',
      category: 'Design',
      level: 'Intermediate',
      price: 2500,
      durationHours: 14,
      rating: 4.95,
      studentsCount: 2890,
      thumbnail: '/images/course_design_engineering_1794504816433.jpg',
      instructorId: 'usr_instructor_02',
      instructorName: 'Sora Takahashi',
      instructorRole: 'Staff Design Systems Lead',
      instructorSignature: 'Sora Takahashi',
      instructorAvatar: '/images/course_design_engineering_1794504816433.jpg',
      status: 'published',
      featured: true,
      skills: ['Design Tokens', 'CSS Architecture', 'Optical Typography', 'Motion Physics'],
      outcomes: [
        'Construct strict CSS variable token hierarchies with zero color leakage',
        'Implement WCAG AA compliant dark surfaces with hairline border geometry',
        'Craft 160ms spring and cubic-bezier micro-interactions on the GPU compositor',
      ],
      modules: [
        {
          _id: 'mod_02_1',
          title: '01. Chromatic Discipline & Dark Surface Geometry',
          lessons: [
            {
              _id: 'les_02_1_1',
              title: 'The 85-10-5 Black & Crimson Proportion Rule',
              durationMinutes: 24,
              videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
              summary: 'Why warm near-black (#0A0707) and 1px hairline borders outperform heavy drop shadows in high-craft UI.',
              keyTakeaways: [
                'Reserve high-chroma accents for 5% of the viewport surface',
                'Use 1px structural hairlines instead of blurred elevation shadows',
              ],
            },
            {
              _id: 'les_02_1_2',
              title: 'Fluid Clamp Scales & Tabular Numerals',
              durationMinutes: 31,
              videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
              summary: 'Pairing condensed display headlines with geometric sans body copy and tabular-nums alignment.',
              keyTakeaways: [
                'Enforce tabular-nums on all financial and progress metrics',
                'Balance headline line lengths to eliminate orphan words',
              ],
            },
          ],
        },
      ],
      updatedAt: '2026-10-22T15:30:00Z',
    },
    {
      _id: 'crs_03',
      title: 'Full-Stack MERN & TypeScript Distributed Architecture',
      subtitle: 'Master end-to-end type safety, document schema indexing, RBAC security middleware, and zero-downtime deployments.',
      slug: 'fullstack-mern-typescript-architecture',
      category: 'Tech',
      level: 'Intermediate',
      price: 3000,
      durationHours: 22,
      rating: 4.85,
      studentsCount: 2410,
      thumbnail: '/images/hero_collaborative_study_1794504814432.jpg',
      instructorId: 'usr_instructor_01',
      instructorName: 'Marcus Sterling',
      instructorRole: 'Principal Systems Architect',
      instructorSignature: 'Marcus Sterling',
      instructorAvatar: '/images/mentor_portrait_lead_1794504817874.jpg',
      status: 'published',
      featured: true,
      skills: ['MongoDB Aggregation', 'Express & TypeScript', 'React 19 State', 'RBAC Security'],
      outcomes: [
        'Model high-read document collections with compound indexing strategies',
        'Share strict TypeScript contracts between Express controllers and React hooks',
        'Architect multi-role permission boundaries for Student, Instructor, and Admin',
      ],
      modules: [
        {
          _id: 'mod_03_1',
          title: '01. Document Modeling & Aggregation Pipelines',
          lessons: [
            {
              _id: 'les_03_1_1',
              title: 'Embedding vs. Referencing in High-Scale Catalogs',
              durationMinutes: 36,
              videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
              summary: 'Designing course modules, enrollment ledgers, and student progress tracking documents.',
              keyTakeaways: [
                'Embed bounded sub-documents like course modules for atomic reads',
                'Reference high-cardinality collections like enrollments and notes',
              ],
            },
          ],
        },
      ],
      updatedAt: '2026-10-28T09:00:00Z',
    },
    {
      _id: 'crs_04',
      title: 'Product Engineering: High-Velocity Execution & Telemetry',
      subtitle: 'Ship resilient customer-facing products by combining funnel instrumentation, A/B experimentation, and domain-driven UI.',
      slug: 'product-engineering-velocity-telemetry',
      category: 'Product Engineering',
      level: 'Foundation',
      price: 1690,
      durationHours: 12,
      rating: 4.9,
      studentsCount: 1850,
      thumbnail: '/images/hero_floating_mentor_card_1794504815575.jpg',
      instructorId: 'usr_instructor_02',
      instructorName: 'Sora Takahashi',
      instructorRole: 'Staff Design Systems Lead',
      instructorSignature: 'Sora Takahashi',
      instructorAvatar: '/images/course_design_engineering_1794504816433.jpg',
      status: 'published',
      featured: false,
      skills: ['Product Architecture', 'Conversion Flows', 'State Machines', 'Analytics'],
      outcomes: [
        'Eliminate UI dead-ends with comprehensive empty, loading, and error states',
        'Design friction-free checkout and onboarding flows that convert at 2.4x baseline',
        'Instrument real-time cohort retention and syllabus completion analytics',
      ],
      modules: [
        {
          _id: 'mod_04_1',
          title: '01. Mechanism-to-Outcome Product Architecture',
          lessons: [
            {
              _id: 'les_04_1_1',
              title: 'Designing Zero-Friction Checkout & Onboarding',
              durationMinutes: 25,
              videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
              summary: 'Reducing cognitive load during critical user decision gates.',
              keyTakeaways: [
                'Surface tangible syllabus outcomes directly inside the checkout summary',
                'Transition immediately from enrollment to the first actionable lesson',
              ],
            },
          ],
        },
      ],
      updatedAt: '2026-11-01T11:20:00Z',
    },
  ],
  enrollments: [
    {
      _id: 'enr_seed_01',
      userId: 'usr_student_01',
      courseId: 'crs_01',
      enrolledAt: '2026-10-15T14:20:00Z',
      amountPaid: 249,
      paymentRef: 'GRP-9042-AI',
      completedLessonIds: ['les_01_1_1', 'les_01_1_2'],
      progressPercent: 67,
    },
    {
      _id: 'enr_seed_02',
      userId: 'usr_student_01',
      courseId: 'crs_02',
      enrolledAt: '2026-10-02T09:10:00Z',
      amountPaid: 189,
      paymentRef: 'GRP-7811-DS',
      completedLessonIds: ['les_02_1_1', 'les_02_1_2'],
      progressPercent: 100,
      certificateIssuedAt: '2026-10-19T18:45:00Z',
    },
  ],
  notes: [
    {
      _id: 'not_seed_01',
      userId: 'usr_student_01',
      courseId: 'crs_01',
      lessonId: 'les_01_1_1',
      lessonTitle: 'SSE vs. WebSockets for High-Concurrency Inference',
      timestampFormatted: '08:14',
      content: 'Use Server-Sent Events (SSE) with HTTP/2 multiplexing for unidirectional token streams; reserve WebSockets for bidirectional voice/realtime agent sessions.',
      createdAt: '2026-10-16T11:30:00Z',
    },
    {
      _id: 'not_seed_02',
      userId: 'usr_student_01',
      courseId: 'crs_02',
      lessonId: 'les_02_1_1',
      lessonTitle: 'The 85-10-5 Black & Crimson Proportion Rule',
      timestampFormatted: '14:02',
      content: 'Keep --bg at #0A0707 and --surface at #130D0D with 1px #2E1C1C borders so crimson accents (#DC1A21) command immediate focal hierarchy.',
      createdAt: '2026-10-05T16:15:00Z',
    },
  ],
  inquiries: [
    {
      _id: 'inq_seed_01',
      name: 'Aria Chen',
      email: 'aria.chen@FinScale.io',
      topic: 'Enterprise Team Cohort (25 Seats)',
      message: 'Looking to enroll our core platform engineering group into the Production AI Inference and Full-Stack MERN tracks for Q1.',
      status: 'new',
      createdAt: '2026-11-09T17:00:00Z',
    },
  ],
};

const IMAGE_MIGRATION_MAP: Record<string, string> = {
  '/images/hero_collaborative_study_1794406411777.jpg':
    '/images/hero_collaborative_study_1794504814432.jpg',
  '/images/hero_floating_mentor_card_1794406413149.jpg':
    '/images/hero_floating_mentor_card_1794504815575.jpg',
  '/images/course_ai_systems_1794406414690.jpg':
    '/images/course_ai_systems_1794504816295.jpg',
  '/images/course_design_engineering_1794406415481.jpg':
    '/images/course_design_engineering_1794504816433.jpg',
  '/images/mentor_portrait_lead_1794406415964.jpg':
    '/images/mentor_portrait_lead_1794504817874.jpg',
};

function loadDb(): GraspItDatabase {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(SEED_DATA, null, 2), 'utf-8');
      return structuredClone(SEED_DATA);
    }
    let raw = fs.readFileSync(DB_FILE, 'utf-8');
    let migrated = false;
    for (const [oldPath, newPath] of Object.entries(IMAGE_MIGRATION_MAP)) {
      if (raw.includes(oldPath)) {
        raw = raw.split(oldPath).join(newPath);
        migrated = true;
      }
    }
    if (raw.includes('/src/assets/images/')) {
      // Legacy image paths from the AI Studio dev server
      raw = raw.split('/src/assets/images/').join('/images/');
      migrated = true;
    }
    const parsed = JSON.parse(raw) as GraspItDatabase;
    if (migrated) {
      fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
    }
    return parsed;
  } catch {
    return structuredClone(SEED_DATA);
  }
}

function saveDb(db: GraspItDatabase): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist database:', err);
  }
}

// ─── AUTH HELPERS (scrypt password hashing + signed bearer tokens) ─────────
const AUTH_SECRET =
  process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.AUTH_SECRET && process.env.NODE_ENV === 'production') {
  console.warn(
    'AUTH_SECRET is not set: using a random secret. Logins will reset on every restart.'
  );
}
const DEMO_MODE = (process.env.DEMO_MODE || '').trim().toLowerCase() === 'true';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SEED_USER_IDS = new Set([
  'usr_student_01',
  'usr_instructor_01',
  'usr_instructor_02',
  'usr_admin_01',
]);

function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(plain: string, stored?: string): boolean {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(plain, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return (
    candidate.length === expected.length &&
    crypto.timingSafeEqual(candidate, expected)
  );
}

function signToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: Date.now() + TOKEN_TTL_MS })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payload)
    .digest('base64url');
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

type AuthedRequest = Request & { user?: UserDocument };

function stripPassword(u: UserDocument): UserDocument {
  const { password: _pw, ...rest } = u;
  return rest;
}

/** Attaches req.user when a valid bearer token for an active user is present. */
function authenticate(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const userId = verifyToken(header.slice(7));
    if (userId) {
      const user = loadDb().users.find((u) => u._id === userId);
      if (user && user.status !== 'suspended') req.user = user;
    }
  }
  next();
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

/** Hash any plaintext passwords; lock seed accounts unless DEMO_MODE=true. */
function initDb(): void {
  const db = loadDb();
  let changed = false;
  for (const u of db.users) {
    if (!u.password) {
      u.password = hashPassword(crypto.randomBytes(24).toString('hex'));
      changed = true;
    } else if (!u.password.startsWith('scrypt$')) {
      u.password = hashPassword(u.password);
      changed = true;
    }
    if (SEED_USER_IDS.has(u._id)) {
      const isDemoPassword = verifyPassword('password123', u.password);
      if (DEMO_MODE && !isDemoPassword) {
        // Demo mode: always (re)open the seed accounts, even if an earlier
        // run without DEMO_MODE had locked them.
        u.password = hashPassword('password123');
        changed = true;
      } else if (!DEMO_MODE && isDemoPassword) {
        u.password = hashPassword(crypto.randomBytes(24).toString('hex'));
        changed = true;
      }
    }
  }
  if (changed) saveDb(db);
}

function visibleCourses(db: GraspItDatabase, user?: UserDocument): CourseDocument[] {
  if (user?.role === 'admin') return db.courses;
  const enrolled = new Set(
    user ? db.enrollments.filter((e) => e.userId === user._id).map((e) => e.courseId) : []
  );
  return db.courses.filter(
    (c) =>
      c.status === 'published' ||
      (user && c.instructorId === user._id) ||
      enrolled.has(c._id)
  );
}

// Simple in-memory login throttle: 10 failed attempts / 15 min per IP
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function loginThrottled(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= 10;
}
function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  initDb();

  // Course routes accept large bodies (base64 cover images); everything else is small.
  app.use('/api/courses', express.json({ limit: '25mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', authenticate);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ─── AUTHENTICATION API ─────────────────────────────────────────────────
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    if (loginThrottled(req.ip || 'unknown')) {
      res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = loadDb();
    const user = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);

    if (!user || !verifyPassword(password, user.password)) {
      recordLoginFailure(req.ip || 'unknown');
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (user.status === 'suspended') {
      res.status(403).json({ error: 'This account has been suspended by an administrator.' });
      return;
    }

    res.json({ user: stripPassword(user), token: signToken(user._id) });
  });

  app.post('/api/auth/signup', (req: Request, res: Response) => {
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

    const db = loadDb();
    const normalizedEmail = email.trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({
        error: 'An account with this email already exists. Please sign in.',
      });
      return;
    }

    // Self-signup can never create an admin.
    const assignedRole: UserRole = role === 'instructor' ? 'instructor' : 'student';

    const newUser: UserDocument = {
      _id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      name: name.trim().slice(0, 100),
      email: normalizedEmail,
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
      status: 'active',
      joinedAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    saveDb(db);
    res.status(201).json({ user: stripPassword(newUser), token: signToken(newUser._id) });
  });

  // ─── GET /api/bootstrap (data is filtered by who is asking) ─────────────
  app.get('/api/bootstrap', (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const user = req.user;
    const courses = visibleCourses(db, user);

    let users: UserDocument[] = [];
    let enrollments: EnrollmentDocument[] = [];
    let notes: LessonNoteDocument[] = [];
    let inquiries: InquiryDocument[] = [];

    if (user?.role === 'admin') {
      users = db.users.map(stripPassword);
      enrollments = db.enrollments;
      notes = db.notes.filter((n) => n.userId === user._id);
      inquiries = db.inquiries;
    } else if (user) {
      users = [stripPassword(user)];
      const ownCourseIds = new Set(
        db.courses.filter((c) => c.instructorId === user._id).map((c) => c._id)
      );
      enrollments = db.enrollments.filter(
        (e) => e.userId === user._id || ownCourseIds.has(e.courseId)
      );
      notes = db.notes.filter((n) => n.userId === user._id);
    }

    res.json({
      categories: db.categories,
      mentors: db.mentors,
      courses,
      users,
      enrollments,
      notes,
      inquiries,
      me: user ? stripPassword(user) : null,
      demoMode: DEMO_MODE,
    });
  });

  // ─── CATEGORIES API ─────────────────────────────────────────────────────
  app.get('/api/categories', (_req: Request, res: Response) => {
    res.json(loadDb().categories);
  });

  app.post(
    '/api/categories',
    requireRole('instructor', 'admin'),
    (req: AuthedRequest, res: Response) => {
      const { name, description } = req.body as { name?: string; description?: string };

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Category name is required.' });
        return;
      }

      const db = loadDb();
      const normalizedName = name.trim().slice(0, 80);
      const existing = db.categories.find(
        (c) => c.name.toLowerCase() === normalizedName.toLowerCase()
      );
      if (existing) {
        res.status(409).json({ error: 'Category already exists.', category: existing });
        return;
      }

      const newCategory: CategoryDocument = {
        _id: `cat_${Date.now()}`,
        name: normalizedName,
        slug: slugify(normalizedName),
        description:
          description?.trim().slice(0, 300) ||
          `Practitioner-led courses and technical mastery in ${normalizedName}.`,
        createdByRole: req.user!.role,
        createdAt: new Date().toISOString(),
      };

      db.categories.push(newCategory);
      saveDb(db);
      res.status(201).json(newCategory);
    }
  );

  app.delete('/api/categories/:id', requireRole('admin'), (req: Request, res: Response) => {
    const db = loadDb();
    const idx = db.categories.findIndex((c) => c._id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Category not found.' });
      return;
    }
    db.categories.splice(idx, 1);
    saveDb(db);
    res.json({ success: true });
  });

  // ─── COURSES API ────────────────────────────────────────────────────────
  app.get('/api/courses', (req: AuthedRequest, res: Response) => {
    res.json(visibleCourses(loadDb(), req.user));
  });

  app.post(
    '/api/courses',
    requireRole('instructor', 'admin'),
    (req: AuthedRequest, res: Response) => {
      const payload = req.body as Partial<CourseDocument>;
      if (!payload.title || !payload.category) {
        res.status(400).json({ error: 'Course title and category are required.' });
        return;
      }

      const user = req.user!;
      const db = loadDb();

      const catExists = db.categories.some(
        (c) => c.name.toLowerCase() === payload.category!.trim().toLowerCase()
      );
      if (!catExists) {
        db.categories.push({
          _id: `cat_${Date.now()}`,
          name: payload.category.trim(),
          slug: slugify(payload.category),
          description: `Practitioner-led courses in ${payload.category.trim()}.`,
          createdByRole: user.role,
          createdAt: new Date().toISOString(),
        });
      }

      // Instructors always author as themselves; admins may set the author.
      const authorId = user.role === 'admin' ? payload.instructorId || user._id : user._id;
      const author = db.users.find((u) => u._id === authorId) || user;

      const newCourse: CourseDocument = {
        _id: `crs_${Date.now()}`,
        title: payload.title.trim(),
        subtitle: payload.subtitle?.trim() || '',
        slug: slugify(payload.title),
        category: payload.category.trim(),
        level: payload.level || 'Intermediate',
        price: Math.max(0, Number(payload.price) || 0),
        durationHours: Number(payload.durationHours) || 1,
        rating: 5.0,
        studentsCount: 0,
        thumbnail: payload.thumbnail || '',
        instructorId: author._id,
        instructorName: author.name,
        instructorRole: author.title,
        instructorSignature: payload.instructorSignature || author.name,
        instructorAvatar: author.avatar,
        // Always require Admin approval before a new course is published
        status: 'pending',
        featured: false,
        skills: Array.isArray(payload.skills) ? payload.skills : [],
        outcomes: Array.isArray(payload.outcomes) ? payload.outcomes : [],
        modules: Array.isArray(payload.modules) ? payload.modules : [],
        updatedAt: new Date().toISOString(),
      };

      db.courses.unshift(newCourse);
      saveDb(db);
      res.status(201).json({ course: newCourse, categories: db.categories });
    }
  );

  app.put(
    '/api/courses/:id',
    requireRole('instructor', 'admin'),
    (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const db = loadDb();
      const index = db.courses.findIndex((c) => c._id === req.params.id);
      if (index === -1) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      const existing = db.courses[index];
      if (user.role !== 'admin' && existing.instructorId !== user._id) {
        res.status(403).json({ error: 'You can only edit your own courses.' });
        return;
      }

      const changes: Partial<CourseDocument> = { ...req.body };
      if (user.role !== 'admin') {
        // Instructors can't self-publish, feature, reassign, or fake stats.
        delete changes.featured;
        delete changes.instructorId;
        delete changes.rating;
        delete changes.studentsCount;
        if (changes.status && !['draft', 'pending'].includes(changes.status)) {
          delete changes.status;
        }
      }

      const updated: CourseDocument = {
        ...existing,
        ...changes,
        _id: existing._id,
        updatedAt: new Date().toISOString(),
      };
      db.courses[index] = updated;
      saveDb(db);
      res.json(updated);
    }
  );

  app.delete(
    '/api/courses/:id',
    requireRole('instructor', 'admin'),
    (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const db = loadDb();
      const index = db.courses.findIndex((c) => c._id === req.params.id);
      if (index === -1) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      if (user.role !== 'admin' && db.courses[index].instructorId !== user._id) {
        res.status(403).json({ error: 'You can only delete your own courses.' });
        return;
      }
      db.courses.splice(index, 1);
      saveDb(db);
      res.json({ success: true });
    }
  );

  // ─── ENROLLMENTS & PROGRESS API ─────────────────────────────────────────
  app.post('/api/enrollments', requireAuth, (req: AuthedRequest, res: Response) => {
    const { courseId } = req.body as { courseId?: string };
    const user = req.user!;

    if (!courseId) {
      res.status(400).json({ error: 'courseId is required.' });
      return;
    }

    const db = loadDb();
    const course = db.courses.find((c) => c._id === courseId);
    if (!course || course.status !== 'published') {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }

    const existing = db.enrollments.find(
      (e) => e.userId === user._id && e.courseId === courseId
    );
    if (existing) {
      res.json(existing);
      return;
    }

    course.studentsCount += 1;

    const enrollment: EnrollmentDocument = {
      _id: `enr_${Date.now()}`,
      userId: user._id,
      courseId,
      enrolledAt: new Date().toISOString(),
      // Payments are simulated: the amount always comes from the course price.
      amountPaid: course.price,
      paymentRef: `GRP-${crypto.randomInt(1000, 10000)}`,
      completedLessonIds: [],
      progressPercent: 0,
    };

    db.enrollments.unshift(enrollment);
    saveDb(db);
    res.status(201).json(enrollment);
  });

  app.patch(
    '/api/enrollments/:id/progress',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const { lessonId } = req.body as { lessonId: string };
      const db = loadDb();
      const enrollment = db.enrollments.find((e) => e._id === req.params.id);
      if (!enrollment || enrollment.userId !== req.user!._id) {
        res.status(404).json({ error: 'Enrollment not found.' });
        return;
      }

      const course = db.courses.find((c) => c._id === enrollment.courseId);
      const totalLessons =
        course?.modules.reduce((acc, m) => acc + m.lessons.length, 0) || 1;

      if (enrollment.completedLessonIds.includes(lessonId)) {
        enrollment.completedLessonIds = enrollment.completedLessonIds.filter(
          (id) => id !== lessonId
        );
      } else {
        enrollment.completedLessonIds.push(lessonId);
      }

      enrollment.progressPercent = Math.min(
        100,
        Math.round((enrollment.completedLessonIds.length / totalLessons) * 100)
      );

      if (enrollment.progressPercent === 100 && !enrollment.certificateIssuedAt) {
        enrollment.certificateIssuedAt = new Date().toISOString();
      }

      saveDb(db);
      res.json(enrollment);
    }
  );

  // ─── STUDENT NOTES API ──────────────────────────────────────────────────
  app.post('/api/notes', requireAuth, (req: AuthedRequest, res: Response) => {
    const { courseId, lessonId, lessonTitle, timestampFormatted, content } =
      req.body as Partial<LessonNoteDocument>;

    if (!courseId || !lessonId || !content?.trim()) {
      res.status(400).json({ error: 'Note content and lesson context are required.' });
      return;
    }

    const db = loadDb();
    const note: LessonNoteDocument = {
      _id: `not_${Date.now()}`,
      userId: req.user!._id,
      courseId,
      lessonId,
      lessonTitle: lessonTitle || 'Lesson Note',
      timestampFormatted: timestampFormatted || '00:00',
      content: content.trim().slice(0, 5000),
      createdAt: new Date().toISOString(),
    };

    db.notes.unshift(note);
    saveDb(db);
    res.status(201).json(note);
  });

  app.delete('/api/notes/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const idx = db.notes.findIndex((n) => n._id === req.params.id);
    if (idx !== -1) {
      if (db.notes[idx].userId !== req.user!._id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'You can only delete your own notes.' });
        return;
      }
      db.notes.splice(idx, 1);
      saveDb(db);
    }
    res.json({ success: true });
  });

  // ─── ADMIN GOVERNANCE API ───────────────────────────────────────────────
  app.patch('/api/users/:id', requireRole('admin'), (req: AuthedRequest, res: Response) => {
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
    if (req.params.id === req.user!._id && (role || status)) {
      res.status(400).json({ error: 'You cannot change your own role or status.' });
      return;
    }
    const db = loadDb();
    const user = db.users.find((u) => u._id === req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (role) user.role = role;
    if (status) user.status = status;
    saveDb(db);
    res.json(stripPassword(user));
  });

  app.post('/api/inquiries', (req: Request, res: Response) => {
    const { name, email, topic, message } = req.body as Partial<InquiryDocument>;
    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      res.status(400).json({ error: 'Name, email, and message are required.' });
      return;
    }

    const db = loadDb();
    const inquiry: InquiryDocument = {
      _id: `inq_${Date.now()}`,
      name: name.trim().slice(0, 100),
      email: email.trim().slice(0, 200),
      topic: topic?.trim().slice(0, 200) || 'Curriculum & Admissions Inquiry',
      message: message.trim().slice(0, 5000),
      status: 'new',
      createdAt: new Date().toISOString(),
    };

    db.inquiries.unshift(inquiry);
    saveDb(db);
    res.status(201).json(inquiry);
  });

  app.patch('/api/inquiries/:id', requireRole('admin'), (req: Request, res: Response) => {
    const db = loadDb();
    const inquiry = db.inquiries.find((i) => i._id === req.params.id);
    if (!inquiry) {
      res.status(404).json({ error: 'Inquiry not found.' });
      return;
    }
    inquiry.status = inquiry.status === 'new' ? 'reviewed' : 'new';
    saveDb(db);
    res.json(inquiry);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // ─── VITE (dev) OR STATIC BUILD (production) ────────────────────────────
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GraspIt server running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'}${DEMO_MODE ? ', demo mode' : ''})`);
  });
}

startServer();
