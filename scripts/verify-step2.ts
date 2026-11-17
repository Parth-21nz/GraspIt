/** Real PostgreSQL/API regression checks. All writes use a fresh disposable schema. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { importDatabase } from '../server/importData.ts';
import { SEED_DATA } from '../server/seedData.ts';

assert(process.env.DATABASE_URL, 'DATABASE_URL is required.');
assert(fs.existsSync('dist/index.html'), 'Run npm run build first.');
const schema = `graspit_verify_${crypto.randomBytes(8).toString('hex')}`;
assert(/^graspit_verify_[a-f0-9]{16}$/.test(schema));
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', schema);
const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url.toString(), AUTH_SECRET: crypto.randomBytes(32).toString('hex') };
// CLI and runtime must select the same temporary schema, even when DIRECT_URL is set.
env.DIRECT_URL = env.DATABASE_URL;
env.PAYMENTS_MODE = 'disabled';
env.PUBLIC_ORIGIN = 'http://localhost:3000';
env.TRUST_PROXY = 'false';
env.VIDEO_ORIGINS = 'https://www.youtube.com,https://youtube.com,https://youtu.be,https://www.youtube-nocookie.com,https://vimeo.com,https://player.vimeo.com,https://example.test';
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10_000 }, { schema }),
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
});
let child: ChildProcess | undefined;
let base = '';
let failures = 0;
let passed = 0;

async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (err) { failures++; console.error(`FAIL ${name}:`, err instanceof Error ? err.message : err); }
}

function cli(args: string[]) {
  const result = spawnSync(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), ...args], {
    env, encoding: 'utf8', timeout: 90_000, windowsHide: true,
  });
  assert.equal(result.status, 0, `${args.join(' ')} failed: ${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const stopped = new Promise<void>((resolve) => child!.once('exit', () => resolve()));
  child.kill();
  await stopped;
  child = undefined;
}

async function startServer(demo: boolean) {
  await stopServer();
  const listener = net.createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  base = `http://127.0.0.1:${port}`;
  let output = '';
  child = spawn(process.execPath, ['--import', 'tsx', 'scripts/start-production.ts'], {
    env: { ...env, PORT: String(port), DEMO_MODE: String(demo) },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  child.stdout!.on('data', (data) => { output += data; });
  child.stderr!.on('data', (data) => { output += data; });
  for (let attempt = 0; attempt < 160; attempt++) {
    assert.equal(child.exitCode, null, `Server exited: ${output}`);
    try {
      if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch { /* still starting */ }
    await delay(250);
  }
  throw new Error(`Server did not become ready: ${output}`);
}

async function request(route: string, method = 'GET', body?: unknown, token?: string) {
  const res = await fetch(`${base}/api${route}`, {
    method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000),
  });
  return { status: res.status, body: await res.json() };
}

async function login(email: string) {
  const result = await request('/auth/login', 'POST', { email, password: 'password123' });
  assert.equal(result.status, 200);
  assert(!('password' in result.body.user));
  return result.body.token as string;
}

const counts = async () => Promise.all([
  db.user.count(), db.category.count(), db.mentor.count(), db.course.count(), db.module.count(),
  db.lesson.count(), db.enrollment.count(), db.note.count(), db.inquiry.count(),
]);

try {
  await sql.connect();
  await sql.query(`CREATE SCHEMA "${schema}"`);
  await check('initial migration deploys on an empty schema and redeploy is safe', async () => {
    cli(['migrate', 'deploy']);
    cli(['migrate', 'deploy']);
    cli(['migrate', 'status']);
  });
  if (failures) throw new Error('Migration setup failed; dependent API checks were skipped.');
  await check('hand-written migration exactly matches the Prisma schema', async () => {
    cli(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code']);
  });
  await check('legacy import is idempotent and hashes plaintext passwords', async () => {
    await importDatabase(db, structuredClone(SEED_DATA));
    const before = await counts();
    await importDatabase(db, structuredClone(SEED_DATA));
    assert.deepEqual(await counts(), before);
    assert((await db.user.findUniqueOrThrow({ where: { id: 'usr_student_01' } })).password.startsWith('scrypt$'));
  });
  await check('import skips an existing-email conflict and its orphan course with warnings', async () => {
    const data = structuredClone(SEED_DATA);
    data.users = [{ ...data.users[1], _id: 'conflict_instructor' }];
    data.courses = [{ ...data.courses[0], _id: 'conflict_course', instructorId: 'conflict_instructor' }];
    data.enrollments = []; data.notes = [];
    const report = await importDatabase(db, data);
    assert.equal(await db.course.count({ where: { id: 'conflict_course' } }), 0);
    assert(report.warnings.some((w) => /conflict|already|duplicate/i.test(w)));
  });
  await check('import can reference a parent already in Postgres but absent from the file', async () => {
    const c = { ...structuredClone(SEED_DATA.courses[0]), _id: 'existing_parent_course', modules: [] };
    await importDatabase(db, { courses: [c] });
    assert.equal(await db.course.count({ where: { id: c._id } }), 1);
  });
  await check('malformed imports fail before writing data', async () => {
    await assert.rejects(importDatabase(db, { users: {} } as any), /array of records/);
  });
  await check('an import transaction rolls back all rows on an invalid record', async () => {
    const user = { ...SEED_DATA.users[0], _id: 'rollback_user', email: 'rollback@example.test' };
    const inquiry = { ...SEED_DATA.inquiries[0], _id: undefined };
    await assert.rejects(importDatabase(db, { users: [user], inquiries: [inquiry] } as any));
    assert.equal(await db.user.count({ where: { id: user._id } }), 0);
  });
  await check('legacy invalid/duplicate progress is reconciled before certificate import', async () => {
    const c = { ...structuredClone(SEED_DATA.courses[0]), _id: 'progress_import_course', modules: [{ _id: 'progress_import_module', title: 'Module', lessons: [{ ...SEED_DATA.courses[0].modules[0].lessons[0], _id: 'progress_import_lesson' }, { ...SEED_DATA.courses[0].modules[0].lessons[0], _id: 'progress_import_other' }] }] };
    const e = { ...SEED_DATA.enrollments[0], _id: 'progress_import_enrollment', courseId: c._id, completedLessonIds: ['progress_import_lesson', 'progress_import_lesson', 'foreign_lesson'], progressPercent: 100, certificateIssuedAt: new Date().toISOString() };
    await importDatabase(db, { courses: [c], enrollments: [e] });
    const row = await db.enrollment.findUniqueOrThrow({ where: { id: e._id } });
    assert.deepEqual(row.completedLessonIds, ['progress_import_lesson']);
    assert.equal(row.progressPercent, 50); assert.equal(row.certificateIssuedAt, null);
  });
  await startServer(true);
  const student = await login('student@graspit.dev');
  const instructor = await login('instructor@graspit.dev');
  const admin = await login('admin@graspit.dev');
  const signup = await request('/auth/signup', 'POST', { name: 'Other Student', email: 'verify@example.test', password: 'password123', role: 'admin' });
  assert.equal(signup.status, 201);
  const other = signup.body.token;
  await check('signup cannot create an administrator', async () => assert.equal(signup.body.user.role, 'student'));
  const videoUrls = (courses: any[]) => courses.flatMap((c) => c.modules.flatMap((m: any) => m.lessons.map((l: any) => l.videoUrl)));
  await check('anonymous bootstrap redacts videos and private records', async () => {
    const { body } = await request('/bootstrap');
    assert(body.courses.length > 0);
    assert(body.courses.every((c: any) => c.status === 'published'));
    assert(videoUrls(body.courses).every((v) => v === ''));
    for (const key of ['users', 'enrollments', 'notes', 'inquiries']) assert.deepEqual(body[key], []);
    assert.equal(body.me, null);
  });
  await check('students receive only their own private records and enrolled videos', async () => {
    const { body } = await request('/bootstrap', 'GET', undefined, student);
    assert.equal(body.users.length, 1);
    assert(body.enrollments.every((e: any) => e.userId === body.me._id));
    assert(body.notes.every((n: any) => n.userId === body.me._id));
    const ids = new Set(body.enrollments.map((e: any) => e.courseId));
    assert(videoUrls(body.courses.filter((c: any) => !ids.has(c._id))).every((v) => v === ''));
    assert(videoUrls(body.courses.filter((c: any) => ids.has(c._id))).some(Boolean));
  });
  await check('instructor and administrator bootstrap permissions survive migration', async () => {
    const i = (await request('/bootstrap', 'GET', undefined, instructor)).body;
    assert.equal(i.users.length, 1);
    assert(videoUrls(i.courses.filter((c: any) => c.instructorId === i.me._id)).some(Boolean));
    const a = (await request('/bootstrap', 'GET', undefined, admin)).body;
    assert(a.users.length >= 5);
    assert(a.inquiries.length > 0);
    assert(videoUrls(a.courses).some(Boolean));
    assert(a.users.every((u: any) => !('password' in u)));
  });
  await check('unauthorized writes are denied', async () => {
    assert.equal((await request('/courses', 'POST', {})).status, 401);
    assert.equal((await request('/courses', 'POST', {}, student)).status, 403);
    assert.equal((await request('/users/usr_instructor_01', 'PATCH', { role: 'admin' }, student)).status, 403);
  });
  const courseResult = await request('/courses', 'POST', {
    title: 'Regression Course', category: 'Verification', price: 0,
    instructorId: 'usr_admin_01', studentsCount: 9000, rating: 1, status: 'published', featured: true,
    modules: [{ _id: 'verify_module', title: 'Module', lessons: Array.from({ length: 200 }, (_, i) => ({ _id: `verify_lesson_${i}`, title: `Lesson ${i}`, videoUrl: 'https://example.test/video.mp4' })) }],
  }, instructor);
  assert.equal(courseResult.status, 201);
  const course = courseResult.body.course;
  await check('course creation ignores spoofed author, approval, and statistics', async () => {
    assert.equal(course.instructorId, 'usr_instructor_01');
    assert.equal(course.status, 'pending'); assert.equal(course.featured, false);
    assert.equal(course.studentsCount, 0); assert(!('rating' in course));
  });
  await check('instructor cannot self-publish, reassign, feature, or spoof statistics', async () => {
    const { body, status } = await request(`/courses/${course._id}`, 'PUT', { status: 'published', featured: true, instructorId: 'usr_admin_01', studentsCount: 999, rating: 1 }, instructor);
    assert.equal(status, 200); assert.equal(body.status, 'pending'); assert.equal(body.featured, false);
    assert.equal(body.instructorId, 'usr_instructor_01'); assert.equal(body.studentsCount, 0); assert(!('rating' in body));
  });
  await request(`/courses/${course._id}`, 'PUT', { status: 'published' }, admin);
  await check('unenrolled users cannot create notes on course lessons', async () => {
    assert.equal((await request('/notes', 'POST', { courseId: course._id, lessonId: 'verify_lesson_0', content: 'Unauthorized note' }, other)).status, 403);
  });
  let enrollment: any;
  await check('concurrent enrollment creates one record and increments statistics once', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => request('/enrollments', 'POST', { courseId: course._id, amountPaid: 123456 }, student)));
    assert(results.every((r) => r.status === 200 || r.status === 201));
    assert.equal(new Set(results.map((r) => r.body._id)).size, 1);
    enrollment = results[0].body;
    assert.equal(enrollment.amountPaid, 0);
    assert.equal((await db.course.findUniqueOrThrow({ where: { id: course._id } })).studentsCount, 1);
  });
  await check('progress rejects foreign lessons and another user', async () => {
    assert.equal((await request(`/enrollments/${enrollment._id}/progress`, 'PATCH', { lessonId: 'missing' }, student)).status, 400);
    assert.equal((await request(`/enrollments/${enrollment._id}/progress`, 'PATCH', { lessonId: 'verify_lesson_0' }, other)).status, 404);
  });
  await check('concurrent progress updates do not lose completed lessons', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => request(`/enrollments/${enrollment._id}/progress`, 'PATCH', { lessonId: `verify_lesson_${i}` }, student)));
    assert(results.every((r) => r.status === 200), JSON.stringify(results));
    assert.equal((await db.enrollment.findUniqueOrThrow({ where: { id: enrollment._id } })).completedLessonIds.length, 8);
  });
  await check('99.5 percent completion cannot issue a certificate', async () => {
    await db.enrollment.update({ where: { id: enrollment._id }, data: { completedLessonIds: Array.from({ length: 198 }, (_, i) => `verify_lesson_${i}`), progressPercent: 99, certificateIssuedAt: null } });
    const { body, status } = await request(`/enrollments/${enrollment._id}/progress`, 'PATCH', { lessonId: 'verify_lesson_198' }, student);
    assert.equal(status, 200); assert.equal(body.progressPercent, 99); assert.equal(body.certificateIssuedAt, undefined);
  });
  await check('exact completion issues a certificate', async () => {
    const { body, status } = await request(`/enrollments/${enrollment._id}/progress`, 'PATCH', { lessonId: 'verify_lesson_199' }, student);
    assert.equal(status, 200); assert.equal(body.progressPercent, 100); assert(body.certificateIssuedAt);
  });
  await check('enrolled notes work and another user cannot delete them', async () => {
    const note = await request('/notes', 'POST', { courseId: course._id, lessonId: 'verify_lesson_0', content: 'My note' }, student);
    assert.equal(note.status, 201);
    assert.equal((await request(`/notes/${note.body._id}`, 'DELETE', undefined, other)).status, 403);
    assert.equal((await request(`/notes/${note.body._id}`, 'DELETE', undefined, student)).status, 200);
  });
  await check('deleting a course with enrollments is blocked', async () => assert.equal((await request(`/courses/${course._id}`, 'DELETE', undefined, instructor)).status, 409));
  await check('suspension immediately invalidates an existing token', async () => {
    assert.equal((await request(`/users/${signup.body.user._id}`, 'PATCH', { status: 'suspended' }, admin)).status, 200);
    assert.equal((await request('/enrollments', 'POST', { courseId: course._id }, other)).status, 401);
  });
  await check('oversized anonymous requests and malformed JSON return JSON errors', async () => {
    assert.equal((await request('/inquiries', 'POST', { message: 'x'.repeat(110_000) })).status, 413);
    const res = await fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
    assert.equal(res.status, 400); assert.equal((await res.json()).error, 'Invalid JSON.');
  });
  await startServer(false);
  await check('non-demo startup denies demo credentials', async () => assert.equal((await request('/auth/login', 'POST', { email: 'admin@graspit.dev', password: 'password123' })).status, 401));
  await check('paid enrollment is blocked outside demo mode; free enrollment works', async () => {
    const user = await request('/auth/signup', 'POST', { name: 'Non-demo Student', email: 'non-demo@example.test', password: 'password123' });
    assert.equal(user.status, 201);
    const paid = await db.course.findFirstOrThrow({ where: { price: { gt: 0 }, status: 'published' } });
    assert.equal((await request('/enrollments', 'POST', { courseId: paid.id, amountPaid: 0 }, user.body.token)).status, 402);
    assert.equal((await request('/enrollments', 'POST', { courseId: course._id }, user.body.token)).status, 201);
  });
} finally {
  await stopServer();
  await db.$disconnect();
  // The identifier is generated above, never supplied by the caller.
  await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await sql.end();
  console.log(`Verification: ${passed} passed, ${failures} failed. Temporary schema removed.`);
}
if (failures) process.exitCode = 1;
