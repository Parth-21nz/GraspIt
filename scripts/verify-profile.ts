import assert from 'node:assert/strict';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import { testRequest as request, sessionFromResponse, sessionHeaders } from './http-test.ts';
import { createApp } from '../server/app.ts';
import { createImageStorage } from '../server/storage.ts';
import { cleanupUploads } from '../server/uploads.ts';
import { seedDemo } from '../server/seed.ts';
import { testDatabase } from './test-database.ts';

const ctx = await testDatabase();
const { db, schema } = ctx;
const config = { ...ctx.config, demoMode: true };
const storage = createImageStorage(config);
const makeApp = () => createApp({ prisma: db, config, storage });
let app = makeApp();
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  app = makeApp();
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (err) { failed++; console.error(`FAIL ${name}:`, err instanceof Error ? err.message : err); }
}
const patch = (token: string, body: Record<string, unknown>) => request(app).patch('/api/profile').set(sessionHeaders(token)).send(body);
const login = async (email: string) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  assert.equal(res.status, 200, JSON.stringify(res.body)); return sessionFromResponse(res);
};
const pendingToken = async (email: string) => {
  const files = await fs.readdir(config.mailOutboxDir);
  const messages = await Promise.all(files.map(file => fs.readFile(`${config.mailOutboxDir}/${file}`, 'utf8').then(JSON.parse)));
  const message = messages.filter(message => message.to === email && message.text.includes('#verify-email')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  assert(message, 'Expected an email confirmation message.');
  return message.text.match(/token=([\w-]+)/)[1];
};
try {
  await seedDemo(db, true);
  const signed = await request(app).post('/api/auth/signup').send({ name: 'Profile Learner', email: 'profile@example.test', password: 'password123' });
  assert.equal(signed.status, 201);
  const learner = signed.body.user;
  let token = sessionFromResponse(signed);
  const otherSigned = await request(app).post('/api/auth/signup').send({ name: 'Other Learner', email: 'other-profile@example.test', password: 'password123' });
  const otherToken = sessionFromResponse(otherSigned);
  const instructor = await login('instructor@graspit.dev');
  const admin = await login('admin@graspit.dev');
  await check('profile reads, writes and avatar uploads require authentication', async () => {
    assert.equal((await request(app).get('/api/profile')).status, 401);
    assert.equal((await request(app).patch('/api/profile').send({ name: 'No' })).status, 401);
    assert.equal((await request(app).post('/api/profile/avatar')).status, 401);
  });
  await check('profile returns only the signed-in account and never password data', async () => {
    const res = await request(app).get('/api/profile').set(sessionHeaders(token));
    assert.equal(res.status, 200); assert.equal(res.body.user._id, learner._id); assert.equal(res.body.emailChangeAllowed, true);
    assert(!('password' in res.body.user)); assert(!('currentPassword' in res.body));
  });
  await check('profile updates reject privilege changes, forged owners and invalid fields', async () => {
    for (const input of [{ role: 'admin' }, { status: 'suspended' }, { userId: 'usr_admin_01', name: 'Forged' }, { password: 'newpassword' }, { avatar: 'https://evil.example/avatar.png' }, { name: '   ' }, { name: 12 }, { bio: 'x'.repeat(501) }, { email: [] }, {}]) assert.equal((await patch(token, input)).status, 400, JSON.stringify(input));
    const row = await db.user.findUniqueOrThrow({ where: { id: learner._id } });
    assert.equal(row.name, learner.name); assert.equal(row.role, 'student'); assert.equal(row.status, 'active');
  });
  await check('name, title and bio are editable and persisted with whitespace normalization', async () => {
    const res = await patch(token, { name: '  Updated Learner ', title: ' Full-stack student ', bio: ' Learning by building. ' });
    assert.equal(res.status, 200); assert.equal(res.body.user.name, 'Updated Learner'); assert.equal(res.body.user.title, 'Full-stack student'); assert.equal(res.body.user.bio, 'Learning by building.');
    const reload = await request(app).get('/api/profile').set(sessionHeaders(token));
    assert.equal(reload.body.user.name, 'Updated Learner');
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: otherSigned.body.user._id } })).name, 'Other Learner');
  });
  await check('instructor profile edits update course authors without overwriting signatures', async () => {
    const before = await db.course.findFirstOrThrow({ where: { instructorId: 'usr_instructor_01' } });
    assert.equal((await patch(instructor, { name: 'Updated Instructor', title: 'Database engineer' })).status, 200);
    const courses = await request(app).get('/api/courses').set(sessionHeaders(instructor));
    const course = courses.body.find((c: any) => c._id === before.id);
    assert.equal(course.instructorName, 'Updated Instructor'); assert.equal(course.instructorRole, 'Database engineer');
    assert.equal(course.instructorSignature, before.instructorSignature);
  });
  await check('email changes require correct current-password confirmation and are atomic', async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: learner._id } });
    for (const currentPassword of [undefined, 'wrong-password']) {
      assert.equal((await patch(token, { name: 'Must not be saved', email: 'changed@example.test', currentPassword })).status, 400);
    }
    const after = await db.user.findUniqueOrThrow({ where: { id: learner._id } });
    assert.equal(after.name, before.name); assert.equal(after.email, before.email);
  });
  await check('duplicate email changes return 409 and preserve the original account', async () => {
    assert.equal((await patch(token, { email: 'OTHER-PROFILE@example.test', currentPassword: 'password123' })).status, 409);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: learner._id } })).email, 'profile@example.test');
  });
  await check('successful email changes normalize email and preserve password, role and membership', async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: learner._id } });
    const res = await patch(token, { email: '  Changed-Profile@EXAMPLE.TEST ', currentPassword: 'password123' });
    assert.equal(res.status, 200); assert.equal(res.body.user.email, before.email); assert.equal(res.body.pendingEmail, 'changed-profile@example.test');
    const verified = await request(app).post('/api/auth/verify-email').set(sessionHeaders(token)).send({ token: await pendingToken('changed-profile@example.test') });
    assert.equal(verified.status, 200); assert.equal(verified.body.requiresSignIn, true);
    const after = await db.user.findUniqueOrThrow({ where: { id: learner._id } });
    assert.equal(after.password, before.password); assert.equal(after.role, before.role); assert.equal(after.joinedAt.toISOString(), before.joinedAt.toISOString());
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'profile@example.test', password: 'password123' })).status, 401);
    token = await login(after.email);
  });
  await check('shared demo email is fixed while other profile fields stay editable', async () => {
    const profile = await request(app).get('/api/profile').set(sessionHeaders(instructor));
    assert.equal(profile.body.emailChangeAllowed, false);
    assert.equal((await patch(instructor, { email: 'broken-demo@example.test', currentPassword: 'password123' })).status, 400);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: 'usr_instructor_01' } })).email, 'instructor@graspit.dev');
  });
  const image = await sharp({ create: { width: 1024, height: 768, channels: 3, background: '#a41920' } }).png().toBuffer();
  let asset: any;
  await check('students can upload a bounded avatar without gaining course-upload privileges', async () => {
    const res = await request(app).post('/api/profile/avatar').set(sessionHeaders(token)).attach('file', image, { filename: 'avatar.png', contentType: 'image/png' });
    assert.equal(res.status, 201, JSON.stringify(res.body)); asset = res.body;
    assert.equal(asset.width, 512); assert.equal(asset.height, 384); assert.equal(asset.mimeType, 'image/webp');
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: learner._id } })).avatarAssetId, null);
    assert.equal((await request(app).post('/api/uploads').set(sessionHeaders(token)).attach('file', image, 'cover.png')).status, 403);
    const invalid = await request(app).post('/api/profile/avatar').set(sessionHeaders(token)).attach('file', Buffer.from('<svg/>'), { filename: 'bad.png', contentType: 'image/png' });
    assert.equal(invalid.status, 415);
  });
  await check('avatar attachment requires ownership even for an administrator', async () => {
    assert.equal((await patch(otherToken, { avatarAssetId: asset._id })).status, 403);
    assert.equal((await patch(admin, { avatarAssetId: asset._id })).status, 403);
    const res = await patch(token, { avatarAssetId: asset._id });
    assert.equal(res.status, 200); assert.equal(res.body.user.avatar, asset.url); assert.equal(res.body.user.avatarAssetId, asset._id);
  });
  await check('cleanup preserves an active avatar and collects it after removal', async () => {
    await db.uploadAsset.update({ where: { id: asset._id }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    await cleanupUploads(db, schema, storage);
    assert.equal(await db.uploadAsset.count({ where: { id: asset._id } }), 1);
    assert.equal((await request(app).get(asset.url)).status, 200);
    const removed = await patch(token, { avatarAssetId: null });
    assert.equal(removed.status, 200); assert.equal(removed.body.user.avatar, ''); assert.equal(removed.body.user.avatarAssetId, null);
    assert.equal((await cleanupUploads(db, schema, storage)).removed, 1);
    assert.equal((await request(app).get(asset.url)).status, 404);
  });
  await check('concurrent email changes cannot claim the same email address twice', async () => {
    const results = await Promise.all([token, otherToken].map((t) => patch(t, { email: 'race-profile@example.test', currentPassword: 'password123' })));
    assert(results.every(result => result.status === 200));
    const files = await fs.readdir(config.mailOutboxDir);
    const messages = (await Promise.all(files.map(file => fs.readFile(`${config.mailOutboxDir}/${file}`, 'utf8').then(JSON.parse)))).filter(message => message.to === 'race-profile@example.test');
    assert.equal(messages.length, 2);
    const verified = await Promise.all(messages.map(message => request(app).post('/api/auth/verify-email').send({ token: message.text.match(/token=([\w-]+)/)[1] })));
    assert.deepEqual(verified.map(result => result.status).sort(), [200, 409]);
    assert.equal(await db.user.count({ where: { email: 'race-profile@example.test' } }), 1);
  });
  await check('profile writes are rate limited', async () => {
    token = await login((await db.user.findUniqueOrThrow({ where: { id: learner._id } })).email);
    for (let i = 0; i < 20; i++) assert.equal((await patch(token, {})).status, 400);
    assert.equal((await patch(token, {})).status, 429);
  });
} finally {
  await ctx.close();
  console.log(`Profile verification: ${passed} passed, ${failed} failed. Temporary schema and files removed.`);
}
if (failed) process.exitCode = 1;
