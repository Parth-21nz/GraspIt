import crypto from 'crypto';
import type { Prisma, PrismaClient } from '../generated/prisma/client.ts';
import type { GraspItDatabase } from './dbTypes.ts';
import { hashPassword, newId } from './password.ts';

const ROLES = ['student', 'instructor', 'admin'] as const;
const LEVELS = ['Foundation', 'Intermediate', 'Principal'] as const;
const COURSE_STATUSES = ['draft', 'pending', 'published'] as const;

/** Deterministic id, so re-running an import regenerates the same ids (stays idempotent). */
const stableId = (prefix: string, ...parts: (string | number | undefined)[]): string =>
  `${prefix}_${crypto.createHash('sha1').update(parts.join(':')).digest('hex').slice(0, 16)}`;

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

const toDate = (v: unknown): Date => {
  const d = v ? new Date(String(v)) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export interface ImportReport {
  users: number;
  categories: number;
  mentors: number;
  courses: number;
  modules: number;
  lessons: number;
  enrollments: number;
  notes: number;
  inquiries: number;
  warnings: string[];
}

/**
 * Inserts a legacy-JSON-shaped dataset into Postgres in one transaction.
 * Safe to re-run: rows whose id (or unique key) already exists are skipped.
 * Orphaned rows (e.g. an enrollment whose user or course is gone) are dropped
 * with a warning instead of aborting the whole import.
 */
export async function importDatabase(
  prisma: PrismaClient,
  data: Partial<GraspItDatabase>
): Promise<ImportReport> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The import must contain a JSON object.');
  }
  for (const key of ['users', 'categories', 'mentors', 'courses', 'enrollments', 'notes', 'inquiries'] as const) {
    if (data[key] !== undefined && (!Array.isArray(data[key]) || data[key].some((row) => !row || typeof row !== 'object' || Array.isArray(row)))) {
      throw new Error(`Invalid import: ${key} must be an array of records.`);
    }
  }
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const [existingUsers, existingCourses, existingModules, existingLessons] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true } }),
    prisma.course.findMany({ select: { id: true } }),
    prisma.module.findMany({ select: { id: true } }),
    prisma.lesson.findMany({ select: { id: true, module: { select: { courseId: true } } } }),
  ]);
  const existingUserById = new Map(existingUsers.map((u) => [u.id, u]));
  const existingEmailIds = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u.id]));
  const existingCourseIds = new Set(existingCourses.map((c) => c.id));

  // ── users ────────────────────────────────────────────────────────────
  const seenEmails = new Set<string>();
  const seenUserIds = new Set<string>();
  const users: Prisma.UserCreateManyInput[] = [];
  for (const u of data.users ?? []) {
    const email = str(u.email).trim().toLowerCase();
    if (!u._id || !email) {
      warn(`Skipped a user without id/email.`);
      continue;
    }
    const existing = existingUserById.get(u._id);
    if (existing) {
      if (existing.email.toLowerCase() !== email) {
        throw new Error(`User id ${u._id} belongs to a different email in Postgres. Resolve this identity conflict before importing.`);
      }
      continue;
    }
    if (seenEmails.has(email) || existingEmailIds.has(email) || seenUserIds.has(u._id)) {
      warn(`Skipped duplicate email ${email} (user ${u._id}).`);
      continue;
    }
    seenEmails.add(email);
    seenUserIds.add(u._id);
    const pw = str(u.password);
    users.push({
      id: u._id,
      name: str(u.name, 'Unnamed').slice(0, 100),
      email,
      // keep existing scrypt hashes; hash legacy plaintext; lock accounts with none
      password: pw.startsWith('scrypt$')
        ? pw
        : hashPassword(pw || newId('locked')),
      role: pick(u.role, ROLES, 'student'),
      title: str(u.title),
      bio: str(u.bio),
      avatar: str(u.avatar),
      status: u.status === 'suspended' ? ('suspended' as const) : ('active' as const),
      joinedAt: toDate(u.joinedAt),
    });
  }
  const userIds = new Set([...existingUsers.map((u) => u.id), ...users.map((u) => u.id)]);

  // ── categories ───────────────────────────────────────────────────────
  const seenCat = new Set<string>();
  const categories: Prisma.CategoryCreateManyInput[] = [];
  for (const c of data.categories ?? []) {
    const name = str(c.name).trim();
    if (!c._id || !name || seenCat.has(name.toLowerCase())) continue;
    seenCat.add(name.toLowerCase());
    categories.push({
      id: c._id,
      name,
      description: str(c.description),
      createdByRole: pick(c.createdByRole, ROLES, 'admin'),
      createdAt: toDate(c.createdAt),
    });
  }

  // ── mentors ──────────────────────────────────────────────────────────
  const mentors = (data.mentors ?? []).map((m, i) => ({
    id: m._id,
    name: str(m.name),
    role: str(m.role),
    organization: str(m.organization),
    signatureQuote: str(m.signatureQuote),
    bio: str(m.bio),
    avatar: str(m.avatar),
    specialties: strArr(m.specialties),
    studentsMentored: str(m.studentsMentored),
    position: i,
  }));

  // ── courses / modules / lessons ──────────────────────────────────────
  const courses: Prisma.CourseCreateManyInput[] = [];
  const modules: Prisma.ModuleCreateManyInput[] = [];
  const lessons: Prisma.LessonCreateManyInput[] = [];
  const usedModuleIds = new Set(existingModules.map((m) => m.id));
  const usedLessonIds = new Set(existingLessons.map((l) => l.id));
  const courseLessonIds = new Map<string, Set<string>>();
  const lessonIdMap = new Map<string, Map<string, string>>();
  for (const l of existingLessons) {
    const ids = courseLessonIds.get(l.module.courseId) ?? new Set<string>();
    ids.add(l.id);
    courseLessonIds.set(l.module.courseId, ids);
  }
  // The old file listed courses newest-first; keep that order via createdAt.
  const orderBase = Date.now();
  for (const [courseIndex, c] of (data.courses ?? []).entries()) {
    // Existing courses are authoritative. Do not append stale curriculum on a rerun.
    if (existingCourseIds.has(c._id)) continue;
    if (!c._id || !userIds.has(c.instructorId)) {
      warn(`Skipped course ${c._id ?? '(no id)'}: instructor ${c.instructorId} not found.`);
      continue;
    }
    if (courses.some((row) => row.id === c._id)) {
      warn(`Skipped duplicate course ${c._id}.`);
      continue;
    }
    const lessonIds = new Set<string>();
    const remapped = new Map<string, string>();
    courseLessonIds.set(c._id, lessonIds);
    lessonIdMap.set(c._id, remapped);
    courses.push({
      id: c._id,
      title: str(c.title, 'Untitled'),
      subtitle: str(c.subtitle),
      category: str(c.category),
      level: pick(c.level, LEVELS, 'Intermediate'),
      price: Math.max(0, Math.round(num(c.price))),
      durationHours: num(c.durationHours, 1),
      studentsCount: Math.max(0, Math.round(num(c.studentsCount))),
      thumbnail: str(c.thumbnail),
      instructorId: c.instructorId,
      instructorSignature: str(c.instructorSignature),
      status: pick(c.status, COURSE_STATUSES, 'draft'),
      featured: Boolean(c.featured),
      skills: strArr(c.skills),
      outcomes: strArr(c.outcomes),
      createdAt: new Date(orderBase - courseIndex * 1000),
      updatedAt: toDate(c.updatedAt),
    });
    (c.modules ?? []).forEach((m, mi) => {
      let moduleId = m._id;
      if (!moduleId || usedModuleIds.has(moduleId)) {
        moduleId = stableId('mod', c._id, mi, m._id);
        warn(`Module id ${m._id} in course ${c._id} was missing/duplicated; assigned ${moduleId}.`);
      }
      usedModuleIds.add(moduleId);
      modules.push({ id: moduleId, courseId: c._id, title: str(m.title), position: mi });
      (m.lessons ?? []).forEach((l, li) => {
        let lessonId = l._id;
        if (!lessonId || usedLessonIds.has(lessonId)) {
          lessonId = stableId('les', c._id, mi, li, l._id);
          warn(
            `Lesson id ${l._id} in course ${c._id} was missing/duplicated; assigned ${lessonId}.`
          );
        }
        usedLessonIds.add(lessonId);
        lessonIds.add(lessonId);
        if (l._id && !remapped.has(l._id)) remapped.set(l._id, lessonId);
        lessons.push({
          id: lessonId,
          moduleId,
          title: str(l.title),
          durationMinutes: Math.round(num(l.durationMinutes)),
          videoUrl: str(l.videoUrl),
          summary: str(l.summary),
          keyTakeaways: strArr(l.keyTakeaways),
          position: li,
        });
      });
    });
  }
  const courseIds = new Set([...existingCourseIds, ...courses.map((c) => c.id)]);

  // ── enrollments (unique per user+course) ─────────────────────────────
  const seenEnr = new Set<string>();
  const enrollments: Prisma.EnrollmentCreateManyInput[] = [];
  for (const e of data.enrollments ?? []) {
    const key = `${e.userId}:${e.courseId}`;
    if (!userIds.has(e.userId) || !courseIds.has(e.courseId)) {
      warn(`Skipped enrollment ${e._id}: user or course not found.`);
      continue;
    }
    if (seenEnr.has(key)) {
      warn(`Skipped duplicate enrollment ${e._id} (${key}).`);
      continue;
    }
    seenEnr.add(key);
    const validIds = courseLessonIds.get(e.courseId) ?? new Set<string>();
    const completed = [...new Set(strArr(e.completedLessonIds).map((id) => lessonIdMap.get(e.courseId)?.get(id) ?? id))].filter((id) => validIds.has(id));
    const allComplete = validIds.size > 0 && completed.length === validIds.size;
    const progressPercent = allComplete ? 100 : validIds.size ? Math.min(99, Math.round(completed.length / validIds.size * 100)) : 0;
    if (completed.length !== strArr(e.completedLessonIds).length || progressPercent !== num(e.progressPercent)) {
      warn(`Reconciled invalid/stale progress for enrollment ${e._id}.`);
    }
    enrollments.push({
      id: e._id,
      userId: e.userId,
      courseId: e.courseId,
      enrolledAt: toDate(e.enrolledAt),
      amountPaid: Math.max(0, Math.round(num(e.amountPaid))),
      paymentRef: str(e.paymentRef, 'IMPORTED'),
      completedLessonIds: completed,
      progressPercent,
      certificateIssuedAt: allComplete && e.certificateIssuedAt ? toDate(e.certificateIssuedAt) : null,
    });
  }

  // ── notes ────────────────────────────────────────────────────────────
  const notes: Prisma.NoteCreateManyInput[] = [];
  for (const n of data.notes ?? []) {
    if (!userIds.has(n.userId) || !courseIds.has(n.courseId)) {
      warn(`Skipped note ${n._id}: user or course not found.`);
      continue;
    }
    const lessonId = lessonIdMap.get(n.courseId)?.get(n.lessonId) ?? n.lessonId;
    if (!courseLessonIds.get(n.courseId)?.has(lessonId)) {
      warn(`Skipped note ${n._id}: lesson does not belong to its course.`);
      continue;
    }
    notes.push({
      id: n._id,
      userId: n.userId,
      courseId: n.courseId,
      lessonId,
      lessonTitle: str(n.lessonTitle, 'Lesson Note'),
      timestampFormatted: str(n.timestampFormatted, '00:00'),
      content: str(n.content),
      createdAt: toDate(n.createdAt),
    });
  }

  // ── inquiries ────────────────────────────────────────────────────────
  const inquiries = (data.inquiries ?? []).map((i) => ({
    id: i._id,
    name: str(i.name),
    email: str(i.email),
    topic: str(i.topic),
    message: str(i.message),
    status: i.status === 'reviewed' ? ('reviewed' as const) : ('new' as const),
    createdAt: toDate(i.createdAt),
  }));

  // Parents before children, all or nothing.
  await prisma.$transaction(
    async (tx) => {
      await tx.user.createMany({ data: users, skipDuplicates: true });
      await tx.category.createMany({ data: categories, skipDuplicates: true });
      await tx.mentor.createMany({ data: mentors, skipDuplicates: true });
      await tx.course.createMany({ data: courses, skipDuplicates: true });
      await tx.module.createMany({ data: modules, skipDuplicates: true });
      await tx.lesson.createMany({ data: lessons, skipDuplicates: true });
      await tx.enrollment.createMany({ data: enrollments, skipDuplicates: true });
      await tx.note.createMany({ data: notes, skipDuplicates: true });
      await tx.inquiry.createMany({ data: inquiries, skipDuplicates: true });
    },
    { maxWait: 10_000, timeout: 60_000 }
  );

  return {
    users: users.length,
    categories: categories.length,
    mentors: mentors.length,
    courses: courses.length,
    modules: modules.length,
    lessons: lessons.length,
    enrollments: enrollments.length,
    notes: notes.length,
    inquiries: inquiries.length,
    warnings,
  };
}
