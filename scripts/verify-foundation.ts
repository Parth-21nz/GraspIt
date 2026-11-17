import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import sharp from 'sharp';
import request from 'supertest';
import { v2 as cloudinary } from 'cloudinary';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import { createImageStorage } from '../server/storage.ts';
import { cleanupUploads, MAX_IMAGE_BYTES, persistImage } from '../server/uploads.ts';
import { migrateDataUriCovers } from '../server/imageMaintenance.ts';
import { seedDemo } from '../server/seed.ts';
import { hashPassword } from '../server/password.ts';
import { provisionAdmin } from '../server/admin.ts';
import { testDatabase } from './test-database.ts';

let passed = 0;
let failures = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (err) { failures++; console.error(`FAIL ${name}:`, err instanceof Error ? err.message : err); }
}
const ctx = await testDatabase();
const { db, config, schema } = ctx;
const storage = createImageStorage(config);
const app = createApp({ prisma: db, config, storage });
const demoApp = createApp({ prisma: db, config: { ...config, demoMode: true }, storage });
const login = async (target: typeof app, email: string) => {
  const res = await request(target).post('/api/auth/login').send({ email, password: 'password123' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token as string;
};
const image = await sharp({ create: { width: 64, height: 40, channels: 3, background: '#c22339' } }).png().toBuffer();
const courseInput = { title: 'Foundation upload test', category: 'Verification', price: 99, modules: [] };

try {
  await check('configuration rejects weak secrets, missing database, unsafe proxy and incomplete Cloudinary', () => {
    assert.throws(() => loadConfig({ ...ctx.env, AUTH_SECRET: 'short' }), /AUTH_SECRET/);
    assert.throws(() => loadConfig({ ...ctx.env, DATABASE_URL: undefined }), /DATABASE_URL/);
    assert.throws(() => loadConfig({ ...ctx.env, TRUST_PROXY: 'true' }), /TRUST_PROXY/);
    assert.throws(() => loadConfig({ ...ctx.env, IMAGE_STORAGE: 'cloudinary', CLOUDINARY_API_SECRET: undefined }), /Cloudinary/);
    assert.throws(() => loadConfig({ ...ctx.env, PAYMENTS_MODE: 'razorpay_test' }), /not implemented/);
  });
  await check('creating or checking an empty application does not insert sample users', async () => {
    assert.equal((await request(app).get('/api/health')).status, 200);
    assert.equal(await db.user.count(), 0);
    await assert.rejects(seedDemo(db, false), /DEMO_MODE/);
    assert.equal(await db.user.count(), 0);
  });
  await check('the local administrator workflow creates a real admin and never overwrites accounts', async () => {
    const input = { name: 'Local Administrator', email: 'local-admin@example.test', password: 'password12345' };
    const created = await provisionAdmin(db, input);
    const row = await db.user.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(row.role, 'admin'); assert(row.password.startsWith('scrypt$'));
    await assert.rejects(provisionAdmin(db, { ...input, password: 'changed-password' }), /already exists/);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: row.id } })).password, row.password);
    assert.equal((await request(app).post('/api/auth/login').send({ email: input.email, password: input.password })).status, 200);
  });
  await check('explicit demo seeding is idempotent', async () => {
    await seedDemo(db, true);
    const before = [await db.user.count(), await db.course.count(), await db.lesson.count()];
    await seedDemo(db, true);
    assert.deepEqual([await db.user.count(), await db.course.count(), await db.lesson.count()], before);
  });
  const instructor = await login(demoApp, 'instructor@graspit.dev');
  const admin = await login(demoApp, 'admin@graspit.dev');
  const student = await login(demoApp, 'student@graspit.dev');
  await db.user.create({ data: { id: 'foundation_instructor', name: 'Other Instructor', email: 'other@example.test', password: hashPassword('password123'), role: 'instructor' } });
  const other = await login(demoApp, 'other@example.test');

  await check('non-demo app denies sample credentials without mutating stored passwords', async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: 'usr_admin_01' } });
    assert.equal((await request(app).post('/api/auth/login').send({ email: before.email, password: 'password123' })).status, 401);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: before.id } })).password, before.password);
  });
  await check('invalid auth primitives return field errors instead of 500', async () => {
    for (const body of [{ email: 123, password: [] }, { email: [], password: null }, { email: 'bad', password: true }]) {
      const res = await request(demoApp).post('/api/auth/login').send(body);
      assert.equal(res.status, 400); assert(res.body.issues.length);
    }
    const res = await request(demoApp).post('/api/auth/signup').send({ name: {}, email: 'valid@example.test', password: 'password123' });
    assert.equal(res.status, 400);
  });
  await check('malformed course numbers, arrays, image schemes and video providers return 400', async () => {
    for (const input of [{ price: 2_147_483_648 }, { price: '99' }, { modules: {} }, { modules: [null] }, { durationHours: -1 }, { thumbnail: 'javascript:alert(1)' }, { thumbnail: `data:image/png;base64,${image.toString('base64')}` }, { thumbnail: 'https://evil.example/image.jpg' }, { modules: [{ title: 'Module', lessons: [{ title: 'Lesson', videoUrl: 'https://evil.example/video.mp4' }] }] }]) {
      const res = await request(demoApp).post('/api/courses').auth(instructor, { type: 'bearer' }).send({ ...courseInput, ...input });
      assert.equal(res.status, 400, JSON.stringify(input));
    }
  });
  await check('category, note, progress, user and inquiry inputs reject incorrect types', async () => {
    const cases: [string, string, unknown][] = [['post', '/api/categories', { name: 123 }], ['post', '/api/notes', { content: [], lessonId: 2 }], ['patch', '/api/enrollments/missing/progress', { lessonId: {} }], ['patch', '/api/users/usr_student_01', { status: [] }], ['post', '/api/inquiries', { name: 'Tester', email: 'invalid', message: true }]];
    for (const [method, url, body] of cases) {
      const res = await (request(demoApp) as any)[method](url).auth(admin, { type: 'bearer' }).send(body);
      assert.equal(res.status, 400, url);
    }
    assert.equal((await request(demoApp).put('/api/courses/bad%20id').auth(admin, { type: 'bearer' }).send({})).status, 400);
  });
  await check('origin checks reject foreign writes and accept the configured origin', async () => {
    const body = { name: 'Tester', email: 'hello@example.test', message: 'Hello' };
    assert.equal((await request(demoApp).post('/api/inquiries').set('Origin', 'https://evil.example').send(body)).status, 403);
    assert.equal((await request(demoApp).post('/api/inquiries').set('Origin', config.publicOrigin).send(body)).status, 201);
  });
  await check('Helmet CSP permits supported media and blocks script/embedding defaults', async () => {
    const res = await request(demoApp).get('/api/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    const csp = res.headers['content-security-policy'];
    assert(csp.includes("script-src 'self';")); assert(!csp.includes('unsafe-eval'));
    assert(csp.includes('https://res.cloudinary.com')); assert(csp.includes('https://www.youtube.com'));
    assert(csp.includes("object-src 'none'")); assert(!csp.includes('upgrade-insecure-requests'));
  });
  await check('all course JSON requests now use the 100 KB limit', async () => {
    const res = await request(demoApp).post('/api/courses').auth(instructor, { type: 'bearer' }).send({ ...courseInput, thumbnail: 'x'.repeat(110_000) });
    assert.equal(res.status, 413);
  });
  await check('uploads reject anonymous users and students before accepting images', async () => {
    assert.equal((await request(demoApp).post('/api/uploads').attach('file', image, { filename: 'cover.png', contentType: 'image/png' })).status, 401);
    assert.equal((await request(demoApp).post('/api/uploads').auth(student, { type: 'bearer' }).attach('file', image, { filename: 'cover.png', contentType: 'image/png' })).status, 403);
  });
  await check('SVG, fake image bytes, malformed forms and multiple files are rejected', async () => {
    const a = createApp({ prisma: db, config: { ...config, demoMode: true }, storage });
    for (const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'), Buffer.from('<html>not an image</html>')]) {
      assert.equal((await request(a).post('/api/uploads').auth(instructor, { type: 'bearer' }).attach('file', bytes, { filename: 'cover.png', contentType: 'image/png' })).status, 415);
    }
    assert.equal((await request(a).post('/api/uploads').auth(instructor, { type: 'bearer' }).send({ file: 'x' })).status, 415);
    assert.equal((await request(a).post('/api/uploads').auth(instructor, { type: 'bearer' }).attach('file', image, 'one.png').attach('file', image, 'two.png')).status, 400);
  });
  await check('known-length and streaming uploads stop at 5 MB', async () => {
    const a = createApp({ prisma: db, config: { ...config, demoMode: true }, storage });
    const bytes = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    assert.equal((await request(a).post('/api/uploads').auth(instructor, { type: 'bearer' }).attach('file', bytes, { filename: 'big.png', contentType: 'image/png' })).status, 413);
    const stream = Readable.from(Array.from({ length: 81 }, () => Buffer.alloc(64 * 1024)));
    assert.equal((await request(a).post('/api/uploads').auth(instructor, { type: 'bearer' }).attach('file', stream as any, { filename: 'big.png', contentType: 'image/png' })).status, 413);
  });
  await check('oversized dimensions and decompression-heavy images are rejected', async () => {
    const a = createApp({ prisma: db, config: { ...config, demoMode: true }, storage });
    for (const [width, height] of [[8193, 1], [5000, 4001]]) {
      const bytes = await sharp({ create: { width, height, channels: 3, background: '#000' } }).png().toBuffer();
      assert.equal((await request(a).post('/api/uploads').auth(instructor, { type: 'bearer' }).attach('file', bytes, { filename: 'large.png', contentType: 'image/png' })).status, 415);
    }
  });
  const upload = await request(demoApp).post('/api/uploads').auth(instructor, { type: 'bearer' }).attach('file', image, { filename: '../../cover.png', contentType: 'image/png' });
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  const asset = upload.body;
  await check('valid images are decoded, re-encoded, recorded and served with safe names', async () => {
    assert.equal(asset.mimeType, 'image/webp'); assert.equal(asset.width, 64); assert.equal(asset.height, 40);
    const stored = await db.uploadAsset.findUniqueOrThrow({ where: { id: asset._id } });
    assert.equal(stored.ownerId, 'usr_instructor_01'); assert.equal(stored.state, 'ready');
    const res = await request(demoApp).get(asset.url);
    assert.equal(res.status, 200); assert.match(res.headers['content-type'], /image\/webp/);
    assert.equal((await sharp(res.body).metadata()).format, 'webp');
    assert(!('ownerId' in asset)); assert(!('providerId' in asset));
  });
  let attachedCourse: string;
  await check('course owner can attach an uploaded asset', async () => {
    const res = await request(demoApp).post('/api/courses').auth(instructor, { type: 'bearer' }).send({ ...courseInput, thumbnailAssetId: asset._id, thumbnail: asset.url });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.course.thumbnailAssetId, asset._id); assert.equal(res.body.course.thumbnail, asset.url);
    attachedCourse = res.body.course._id;
  });
  await check('another instructor cannot attach an asset or bypass ownership with its URL', async () => {
    assert.equal((await request(demoApp).post('/api/courses').auth(other, { type: 'bearer' }).send({ ...courseInput, thumbnailAssetId: asset._id })).status, 403);
    assert.equal((await request(demoApp).post('/api/courses').auth(other, { type: 'bearer' }).send({ ...courseInput, thumbnail: asset.url })).status, 400);
    assert.equal((await request(demoApp).post('/api/courses').auth(instructor, { type: 'bearer' }).send({ ...courseInput, thumbnailAssetId: asset._id, thumbnail: '/images/other.jpg' })).status, 400);
  });
  await check('administrator may attach assets and existing static fixture paths still work', async () => {
    assert.equal((await request(demoApp).post('/api/courses').auth(admin, { type: 'bearer' }).send({ ...courseInput, thumbnailAssetId: asset._id })).status, 201);
    assert.equal((await request(demoApp).put(`/api/courses/${attachedCourse}`).auth(instructor, { type: 'bearer' }).send({ title: 'Keep uploaded cover' })).body.thumbnailAssetId, asset._id);
    assert.equal((await request(demoApp).post('/api/courses').auth(instructor, { type: 'bearer' }).send({ ...courseInput, thumbnail: '/images/course_ai_systems_1794504816295.jpg' })).status, 201);
    const assigned = await request(demoApp).post('/api/courses').auth(admin, { type: 'bearer' }).send({ ...courseInput, instructorId: 'foundation_instructor', thumbnailAssetId: asset._id });
    assert.equal(assigned.status, 201);
    const retained = await request(demoApp).put(`/api/courses/${assigned.body.course._id}`).auth(other, { type: 'bearer' }).send({ title: 'Retain assigned cover', thumbnailAssetId: asset._id, thumbnail: asset.url });
    assert.equal(retained.status, 200); assert.equal(retained.body.thumbnailAssetId, asset._id);
  });
  await check('storage failures return retryable errors without creating assets', async () => {
    const count = await db.uploadAsset.count();
    const unavailable = createApp({ prisma: db, config: { ...config, demoMode: true }, storage: { ...storage, async save() { throw new Error('provider-secret-should-not-leak'); } } });
    const res = await request(unavailable).post('/api/uploads').auth(instructor, { type: 'bearer' }).attach('file', image, 'cover.png');
    assert.equal(res.status, 503); assert(!JSON.stringify(res.body).includes('provider-secret'));
    assert.equal(await db.uploadAsset.count(), count);
  });
  await check('failed database recording compensates the stored image', async () => {
    const before = await fs.readdir(ctx.uploadDir);
    await assert.rejects(persistImage(db, storage, 'missing_user', image));
    assert.deepEqual(await fs.readdir(ctx.uploadDir), before);
  });
  await check('cleanup preserves referenced and recent assets, and removes old orphans', async () => {
    const orphan = await persistImage(db, storage, 'usr_instructor_01', image);
    const recent = await persistImage(db, storage, 'usr_instructor_01', image);
    await db.uploadAsset.updateMany({ where: { id: { in: [orphan._id, asset._id] } }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    assert.equal((await cleanupUploads(db, schema, storage)).removed, 1);
    assert.equal(await db.uploadAsset.count({ where: { id: orphan._id } }), 0);
    assert.equal(await db.uploadAsset.count({ where: { id: { in: [recent._id, asset._id] } } }), 2);
    await assert.rejects(fs.stat(path.join(ctx.uploadDir, `${orphan._id}.webp`)));
  });
  await check('failed cleanup is retryable and assets being deleted cannot be attached', async () => {
    const orphan = await persistImage(db, storage, 'usr_instructor_01', image);
    await db.uploadAsset.update({ where: { id: orphan._id }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    const broken = { ...storage, async delete() { throw new Error('Temporary outage'); } };
    assert.equal((await cleanupUploads(db, schema, broken)).failed, 1);
    assert.equal((await db.uploadAsset.findUniqueOrThrow({ where: { id: orphan._id } })).state, 'deleting');
    assert.equal((await request(demoApp).post('/api/courses').auth(instructor, { type: 'bearer' }).send({ ...courseInput, thumbnailAssetId: orphan._id })).status, 409);
    assert.equal((await cleanupUploads(db, schema, storage)).removed, 1);
  });
  await check('legacy data URI migration is resumable and failed covers remain unchanged', async () => {
    const valid = await db.course.create({ data: { id: 'legacy_image_valid', title: 'Legacy', category: 'Verification', instructorId: 'usr_instructor_01', instructorSignature: '', thumbnail: `data:image/png;base64,${image.toString('base64')}`, skills: [], outcomes: [] } });
    const invalid = await db.course.create({ data: { id: 'legacy_image_invalid', title: 'Invalid', category: 'Verification', instructorId: 'usr_instructor_01', instructorSignature: '', thumbnail: 'data:image/png;base64,broken', skills: [], outcomes: [] } });
    const report = await migrateDataUriCovers(db, schema, storage);
    assert.equal(report.migrated, 1); assert.equal(report.failed, 1);
    const row = await db.course.findUniqueOrThrow({ where: { id: valid.id } });
    assert(row.thumbnailAssetId); assert(!row.thumbnail.startsWith('data:'));
    assert.equal((await db.course.findUniqueOrThrow({ where: { id: invalid.id } })).thumbnail, invalid.thumbnail);
    assert.equal((await migrateDataUriCovers(db, schema, storage, true)).found, 1);
  });
  await check('demo accounts never implicitly enable paid enrollment', async () => {
    const paid = await db.course.findFirstOrThrow({ where: { price: { gt: 0 }, status: 'published', enrollments: { none: { userId: 'foundation_instructor' } } } });
    assert.equal((await request(demoApp).post('/api/enrollments').auth(other, { type: 'bearer' }).send({ courseId: paid.id })).status, 402);
  });
  await check('mock payments work without demo accounts and are explicitly marked', async () => {
    const mockApp = createApp({ prisma: db, config: { ...config, paymentsMode: 'mock' }, storage });
    const signed = await request(mockApp).post('/api/auth/signup').send({ name: 'Mock learner', email: 'mock@example.test', password: 'password123', role: 'admin' });
    assert.equal(signed.body.user.role, 'student');
    const paid = await db.course.findFirstOrThrow({ where: { price: { gt: 0 }, status: 'published' } });
    const res = await request(mockApp).post('/api/enrollments').auth(signed.body.token, { type: 'bearer' }).send({ courseId: paid.id, amountPaid: 0 });
    assert.equal(res.status, 201); assert.equal(res.body.amountPaid, paid.price); assert.equal(res.body.paymentMode, 'mock'); assert.match(res.body.paymentRef, /^MOCK-/);
    const bootstrap = await request(mockApp).get('/api/bootstrap');
    assert.equal(bootstrap.body.demoMode, false); assert.equal(bootstrap.body.paymentsMode, 'mock');
  });
  await check('login rate limiting cannot be bypassed with spoofed forwarding headers', async () => {
    const limited = createApp({ prisma: db, config, storage });
    for (let i = 0; i < 10; i++) assert.equal((await request(limited).post('/api/auth/login').set('X-Forwarded-For', `10.0.0.${i + 1}`).send({ email: 'missing@example.test', password: 'wrong' })).status, 401);
    const last = await request(limited).post('/api/auth/login').send({ email: 'missing@example.test', password: 'wrong' });
    assert.equal(last.status, 429); assert(last.headers['retry-after']);
  });
  await check('Cloudinary adapter signs server-side options and handles provider failures', async () => {
    const uploadStream = cloudinary.uploader.upload_stream;
    const destroy = cloudinary.uploader.destroy;
    let options: any;
    try {
      (cloudinary.uploader as any).upload_stream = (opts: any, callback: any) => {
        options = opts;
        const publicId = opts.folder ? `${opts.folder}/${opts.public_id}` : opts.public_id;
        return new Writable({ write(_chunk, _encoding, next) { next(); }, final(next) { callback(undefined, { public_id: publicId, secure_url: `https://res.cloudinary.com/test/image/upload/${publicId}.webp` }); next(); } });
      };
      (cloudinary.uploader as any).destroy = async (_id: string, opts: any) => { assert.equal(opts.invalidate, true); return { result: 'ok' }; };
      const remote = createImageStorage(loadConfig({ ...ctx.env, IMAGE_STORAGE: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'test-secret' }));
      const result = await remote.save(`upl_${'a'.repeat(32)}`, image);
      assert.equal(options.api_secret, 'test-secret'); assert.equal(options.overwrite, false); assert.equal(options.resource_type, 'image');
      assert(result.url.startsWith('https://res.cloudinary.com/'));
      await remote.delete(result.providerId);
      (cloudinary.uploader as any).upload_stream = (_opts: any, callback: any) => new Writable({ write(_chunk, _encoding, next) { next(); }, final(next) { callback(new Error('private provider detail')); next(); } });
      await assert.rejects(remote.save(`upl_${'b'.repeat(32)}`, image), /storage is unavailable/);
    } finally { cloudinary.uploader.upload_stream = uploadStream; cloudinary.uploader.destroy = destroy; }
  });
} finally {
  await ctx.close();
  console.log(`Foundation/uploads verification: ${passed} passed, ${failures} failed. Temporary schema and files removed.`);
}
if (failures) process.exitCode = 1;
