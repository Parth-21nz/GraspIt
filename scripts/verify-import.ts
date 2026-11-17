// Read-only parity check for the original, valid legacy demonstration dataset.
import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { prisma } from '../server/db.ts';
import type { GraspItDatabase } from '../server/dbTypes.ts';
import { IMAGE_MIGRATION_MAP } from '../server/legacyImages.ts';
import { courseInclude, toCategoryDoc, toCourseDoc, toEnrollmentDoc, toInquiryDoc, toMentorDoc, toNoteDoc, toUserDoc } from '../server/mappers.ts';
import { verifyPassword } from '../server/password.ts';

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve('.data');
const audit = process.argv.includes('--audit');
const allowExtra = audit || process.argv.includes('--allow-extra');
const differences: { id: unknown; fields: string[] }[] = [];
function compareRecord(actual: unknown, expected: unknown) {
  if (!audit) { assert.deepEqual(actual, expected); return; }
  const left = actual as Record<string, unknown>;
  const right = expected as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => !isDeepStrictEqual(left[key], right[key]));
  if (fields.length) differences.push({ id: left._id, fields });
}
const sourceArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const file = path.resolve(sourceArg ?? path.join(dataDir, 'graspit-db.json'));
const original = fs.readFileSync(file);
const digest = (value: Buffer) => crypto.createHash('sha256').update(value).digest('hex');
let raw = original.toString('utf8');
for (const [before, after] of Object.entries(IMAGE_MIGRATION_MAP)) raw = raw.split(before).join(after);
raw = raw.split('/src/assets/images/').join('/images/');
const data = JSON.parse(raw) as GraspItDatabase;
const iso = (value: string) => new Date(value).toISOString();

async function main() {
  const [users, categories, mentors, courses, enrollments, notes, inquiries] = await Promise.all([
    prisma.user.findMany(), prisma.category.findMany(), prisma.mentor.findMany(),
    prisma.course.findMany({ include: courseInclude }), prisma.enrollment.findMany(),
    prisma.note.findMany(), prisma.inquiry.findMany(),
  ]);
  const groups = { users, categories, mentors, courses, enrollments, notes, inquiries };
  for (const key of Object.keys(groups) as (keyof typeof groups)[]) {
    if (allowExtra) assert(groups[key].length >= data[key].length, `${key} has fewer rows than the source`);
    else assert.equal(groups[key].length, data[key].length, `${key} count differs`);
  }
  const sourceEnrollmentIds = new Set(data.enrollments.map((e) => e._id));
  const additionalEnrollments = enrollments.filter((e) => !sourceEnrollmentIds.has(e.id));
  for (const u of data.users) {
    const stored = users.find((row) => row.id === u._id);
    assert(stored, `Missing user ${u._id}`);
    const { password, ...expected } = u;
    compareRecord(toUserDoc(stored), { ...expected, emailVerifiedAt: expected.emailVerifiedAt ?? null, isDemoAccount: ['usr_student_01', 'usr_instructor_01', 'usr_instructor_02', 'usr_admin_01'].includes(u._id), instructorApplicationStatus: expected.instructorApplicationStatus ?? (u.role === 'instructor' ? 'approved' : 'none'), avatarAssetId: expected.avatarAssetId ?? null, email: expected.email.trim().toLowerCase(), joinedAt: iso(expected.joinedAt) });
    if (password?.startsWith('scrypt$')) assert.equal(stored.password, password);
    else if (password) assert(verifyPassword(password, stored.password), `Password mismatch for ${u._id}`);
  }
  // These fields were intentionally removed from the live schema/API. Keep
  // their original values in the unchanged JSON backup, and compare all others.
  for (const c of data.categories) {
    const { slug, ...expected } = c;
    compareRecord(toCategoryDoc(categories.find((r) => r.id === c._id)!), { ...expected, createdAt: iso(c.createdAt) });
  }
  for (const m of data.mentors) {
    const { coursesCount, ...expected } = m;
    compareRecord(toMentorDoc(mentors.find((r) => r.id === m._id)!), expected);
  }
  for (const c of data.courses) {
    const { slug, rating, instructorAvatar, ...expected } = c;
    const additionalStudents = allowExtra && !audit ? additionalEnrollments.filter((e) => e.courseId === c._id).length : 0;
    const stored = courses.find((r) => r.id === c._id);
    assert(stored, `Missing course ${c._id}`);
    for (const module of c.modules) {
      const storedModule = stored.modules.find((row) => row.id === module._id);
      assert(storedModule, `Missing module ${module._id}`);
      for (const lesson of module.lessons) assert(storedModule.lessons.some((row) => row.id === lesson._id), `Missing lesson ${lesson._id}`);
    }
    // Enrollment increments the course's counter and @updatedAt. Accept only
    // that explainable counter delta; all original course content stays strict.
    compareRecord(toCourseDoc(stored, true), { ...expected, studentsCount: expected.studentsCount + additionalStudents, thumbnailAssetId: c.thumbnailAssetId ?? null, updatedAt: additionalStudents > 0 ? stored.updatedAt.toISOString() : iso(c.updatedAt) });
  }
  for (const e of data.enrollments) compareRecord(toEnrollmentDoc(enrollments.find((r) => r.id === e._id)!), { ...e, paymentMode: e.paymentMode ?? 'legacy', enrolledAt: iso(e.enrolledAt), ...(e.certificateIssuedAt ? { certificateIssuedAt: iso(e.certificateIssuedAt) } : {}) });
  for (const n of data.notes) compareRecord(toNoteDoc(notes.find((r) => r.id === n._id)!), { ...n, createdAt: iso(n.createdAt) });
  for (const i of data.inquiries) compareRecord(toInquiryDoc(inquiries.find((r) => r.id === i._id)!), { ...i, createdAt: iso(i.createdAt) });
  const moduleCount = data.courses.reduce((sum, c) => sum + c.modules.length, 0);
  const lessonCount = data.courses.flatMap((c) => c.modules).reduce((sum, m) => sum + m.lessons.length, 0);
  const [storedModuleCount, storedLessonCount] = await Promise.all([prisma.module.count(), prisma.lesson.count()]);
  if (allowExtra) {
    assert(storedModuleCount >= moduleCount);
    assert(storedLessonCount >= lessonCount);
  } else {
    assert.equal(storedModuleCount, moduleCount);
    assert.equal(storedLessonCount, lessonCount);
  }
  assert.equal(digest(fs.readFileSync(file)), digest(original), 'Source JSON was changed');
  console.log(audit
    ? 'Source audit complete: original records are present; field changes are reported below. This does not assert snapshot equality.'
    : allowExtra
    ? 'PASS: retained source records, passwords and curriculum ordering are verified; permitted extra activity is preserved.'
    : 'PASS: retained API fields, passwords, curriculum ordering, and row counts match the source JSON. Only explicitly retired fields are excluded.');
  if (allowExtra) console.log('Additional records:', Object.fromEntries((Object.keys(groups) as (keyof typeof groups)[]).map((key) => [key, groups[key].length - data[key].length])), audit ? '(field changes are reported separately)' : '(course counters include additional enrollments; other retained source fields stay strict)');
  if (audit) console.log('Changes from the original snapshot (values omitted):', differences);
  console.log({ ...Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])), modules: storedModuleCount, lessons: storedLessonCount });
  console.log('Source JSON is unchanged. This check performed no database writes.');
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
