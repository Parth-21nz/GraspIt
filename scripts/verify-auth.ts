import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import rawRequest from 'supertest';
import { testRequest as request, sessionFromResponse, sessionHeaders } from './http-test.ts';
import { testDatabase } from './test-database.ts';
import { createApp } from '../server/app.ts';
import { createImageStorage } from '../server/storage.ts';
import { hashPassword } from '../server/password.ts';
import { loadConfig } from '../server/config.ts';
import type { MailMessage } from '../server/mail.ts';

const ctx = await testDatabase();
const { db, config } = ctx;
const messages: MailMessage[] = [];
const storage = createImageStorage(config);
const makeApp = () => createApp({ prisma: db, config, storage, mail: { async send(message) { messages.push(message); } } });
let app = makeApp();
let passed = 0, failed = 0, next = 0;
const initialPassword = 'initial-password-123';
const post = (url: string, body = {}, session?: string) => request(app).post(`/api/auth/${url}`).set(sessionHeaders(session)).send(body);
const profile = (session: string) => request(app).get('/api/profile').set(sessionHeaders(session));
const rawCookie = (session: string) => JSON.parse(session).cookie.split('=')[1];
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
async function signup(role = 'student') {
  const email = `auth-${++next}@example.test`;
  const res = await post('signup', { name: 'Security Learner', email, password: initialPassword, role });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { user: res.body.user, email, session: sessionFromResponse(res), response: res };
}
async function login(email: string, password = initialPassword) {
  const res = await post('login', { email, password });
  assert.equal(res.status, 200, JSON.stringify(res.body)); return sessionFromResponse(res);
}
function mailToken(email: string, route: string) {
  const message = messages.filter(message => message.to === email && message.text.includes(`#${route}?token=`)).at(-1);
  assert(message, `Expected a ${route} message`);
  return message.text.match(/token=([\w-]+)/)![1];
}
async function check(name: string, fn: () => Promise<void>) {
  app = makeApp();
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (err) { failed++; console.error(`FAIL ${name}:`, err instanceof Error ? err.message : err); }
}
try {
  await db.category.create({ data: { id: 'auth_category', name: 'Tech', createdByRole: 'admin' } });
  await db.user.create({ data: { id: 'auth_admin', name: 'Auth Administrator', email: 'auth-admin@example.test', password: hashPassword(initialPassword), role: 'admin', emailVerifiedAt: new Date() } });
  await check('signup creates a host-only HttpOnly cookie, hashed session and no bearer credential', async () => {
    const account = await signup();
    const cookie = [account.response.headers['set-cookie']].flat().join(';');
    assert(cookie.includes('HttpOnly')); assert(cookie.includes('SameSite=Lax')); assert(cookie.includes('Path=/'));
    assert(!cookie.includes('Domain=')); assert(!cookie.includes('Secure')); assert(!('token' in account.response.body));
    const stored = await db.session.findUniqueOrThrow({ where: { tokenHash: hash(rawCookie(account.session)) } });
    assert.notEqual(stored.tokenHash, rawCookie(account.session)); assert.equal(stored.userId, account.user._id);
    assert.equal((await profile(account.session)).status, 200);
    const boot = await request(app).get('/api/bootstrap').set(sessionHeaders(account.session));
    assert.equal(boot.body.me._id, account.user._id); assert.equal(boot.body.csrfToken, JSON.parse(account.session).csrfToken);
  });
  await check('HTTPS cookies use the __Host prefix and Secure flag', async () => {
    const account = await signup();
    const secureConfig = loadConfig({ ...ctx.env, PUBLIC_ORIGIN: 'https://demo.example.test', MAIL_MODE: 'disabled' });
    const secureApp = createApp({ prisma: db, config: secureConfig, storage });
    const res = await request(secureApp).post('/api/auth/login').send({ email: account.email, password: initialPassword });
    assert.equal(res.status, 200); const value = [res.headers['set-cookie']].flat().join(';'); assert(value.includes('__Host-graspit_session=')); assert(value.includes('Secure')); assert(!value.includes('Domain='));
    assert.throws(() => loadConfig({ ...ctx.env, PUBLIC_ORIGIN: 'http://public.example', MAIL_MODE: 'disabled' }), /HTTPS/);
    assert.throws(() => loadConfig({ ...ctx.env, MAIL_OUTBOX_DIR: 'public/mail' }), /private subdirectory/);
  });
  await check('login/form CSRF, null/foreign origins and cross-site writes are rejected', async () => {
    const account = await signup();
    assert.equal((await rawRequest(app).post('/api/auth/login').send({ email: account.email, password: initialPassword })).status, 403);
    assert.equal((await post('login', { email: account.email, password: initialPassword }).set('Origin', 'https://evil.example')).status, 403);
    assert.equal((await post('login', { email: account.email, password: initialPassword }).set('Origin', 'null')).status, 403);
    assert.equal((await post('logout', {}, account.session).set('Sec-Fetch-Site', 'cross-site')).status, 403);
    assert.equal((await post('logout', {}, account.session).set('Origin', 'http://localhost:3000.evil.example')).status, 403);
    assert.equal((await rawRequest(app).patch('/api/profile').set('Cookie', JSON.parse(account.session).cookie).send({ name: 'Forged' })).status, 403);
    assert.equal((await request(app).patch('/api/profile').set(sessionHeaders(account.session)).set('X-CSRF-Token', 'é'.repeat(43)).send({ name: 'Forged' })).status, 403);
    assert.equal((await request(app).patch('/api/profile').set(sessionHeaders(account.session)).send({ name: 'Legitimate without Origin' })).status, 200);
  });
  await check('legacy bearer tokens and malformed/duplicate session cookies never authenticate', async () => {
    const account = await signup();
    const legacy = await request(app).get('/api/bootstrap').set('Authorization', `Bearer ${rawCookie(account.session)}`);
    assert.equal(legacy.body.me, null);
    const malformed = await request(app).get('/api/bootstrap').set('Cookie', 'graspit_session=broken'); assert.equal(malformed.body.me, null);
    const cookie = JSON.parse(account.session).cookie;
    assert.equal((await request(app).get('/api/bootstrap').set('Cookie', `${cookie}; ${cookie}`)).body.me, null);
  });
  await check('login rotates its current cookie and logout revokes it on the server', async () => {
    const account = await signup();
    const rotated = await post('login', { email: account.email, password: initialPassword }, account.session);
    assert.equal(rotated.status, 200); const current = sessionFromResponse(rotated);
    assert.equal((await profile(account.session)).status, 401); assert.equal((await profile(current)).status, 200);
    assert.equal((await post('logout', {}, current)).status, 200); assert.equal((await profile(current)).status, 401);
  });
  await check('logout-all revokes every device; expired sessions are rejected', async () => {
    const account = await signup(); const second = await login(account.email);
    const sessions = await request(app).get('/api/auth/sessions').set(sessionHeaders(account.session));
    assert.equal(sessions.body.length, 2); assert.equal(sessions.body.filter((session: any) => session.current).length, 1);
    assert(!JSON.stringify(sessions.body).includes('tokenHash'));
    assert.equal((await post('logout-all', {}, account.session)).status, 200);
    assert.equal((await profile(account.session)).status, 401); assert.equal((await profile(second)).status, 401);
    const expired = await login(account.email);
    await db.session.update({ where: { tokenHash: hash(rawCookie(expired)) }, data: { expiresAt: new Date(0) } });
    assert.equal((await profile(expired)).status, 401);
  });
  await check('password changes confirm the old password and revoke sessions and recovery links', async () => {
    const account = await signup(); const second = await login(account.email);
    await post('forgot-password', { email: account.email }); const token = mailToken(account.email, 'reset-password');
    assert.equal((await post('change-password', { currentPassword: 'wrong', newPassword: 'changed-password-123' }, account.session)).status, 400);
    assert.equal((await post('change-password', { currentPassword: initialPassword, newPassword: 'changed-password-123' }, account.session)).status, 200);
    assert.equal((await profile(second)).status, 401);
    assert.equal((await post('reset-password', { token, newPassword: 'unexpected-password-123' })).status, 400);
    assert.equal((await post('login', { email: account.email, password: initialPassword })).status, 401);
    await login(account.email, 'changed-password-123');
  });
  await check('recovery replies are generic and action tokens are stored only as hashes', async () => {
    const account = await signup();
    const known = await post('forgot-password', { email: account.email });
    const unknown = await post('forgot-password', { email: 'missing@example.test' });
    assert.equal(known.status, 200); assert.deepEqual(known.body, unknown.body); assert(!JSON.stringify(known.body).includes('token'));
    const raw = mailToken(account.email, 'reset-password');
    const action = await db.authAction.findUniqueOrThrow({ where: { tokenHash: hash(raw) } });
    assert.notEqual(action.tokenHash, raw); assert(action.expiresAt > new Date());
  });
  await check('a concurrent reset is single-use and invalidates all previous sessions', async () => {
    const account = await signup(); const second = await login(account.email);
    await post('forgot-password', { email: account.email }); const token = mailToken(account.email, 'reset-password');
    const responses = await Promise.all([1, 2].map(() => post('reset-password', { token, newPassword: 'reset-password-123' })));
    assert.deepEqual(responses.map(res => res.status).sort(), [200, 400]);
    assert.equal((await profile(account.session)).status, 401); assert.equal((await profile(second)).status, 401);
    await login(account.email, 'reset-password-123');
  });
  await check('expired, superseded and wrong-purpose action links fail', async () => {
    const account = await signup(); const verification = mailToken(account.email, 'verify-email');
    assert.equal((await post('reset-password', { token: verification, newPassword: 'reset-password-123' })).status, 400);
    await post('forgot-password', { email: account.email }); const old = mailToken(account.email, 'reset-password');
    await post('forgot-password', { email: account.email }); const current = mailToken(account.email, 'reset-password');
    assert.equal((await post('reset-password', { token: old, newPassword: 'reset-password-123' })).status, 400);
    await db.authAction.update({ where: { tokenHash: hash(current) }, data: { expiresAt: new Date(0) } });
    assert.equal((await post('reset-password', { token: current, newPassword: 'reset-password-123' })).status, 400);
  });
  await check('verification is explicit, single-use and required for instructor approval', async () => {
    const account = await signup('instructor');
    assert.equal(account.user.role, 'student'); assert.equal(account.user.instructorApplicationStatus, 'pending');
    assert.equal((await request(app).post('/api/courses').set(sessionHeaders(account.session)).send({ title: 'Unapproved', category: 'Tech' })).status, 403);
    const admin = await login('auth-admin@example.test');
    assert.equal((await request(app).patch(`/api/instructor-applications/${account.user._id}`).set(sessionHeaders(admin)).send({ decision: 'approved' })).status, 400);
    const token = mailToken(account.email, 'verify-email');
    assert.equal((await post('verify-email', { token })).status, 200); assert.equal((await post('verify-email', { token })).status, 400);
    const approved = await request(app).patch(`/api/instructor-applications/${account.user._id}`).set(sessionHeaders(admin)).send({ decision: 'approved' });
    assert.equal(approved.status, 200); assert.equal(approved.body.role, 'instructor');
    const course = await request(app).post('/api/courses').set(sessionHeaders(account.session)).send({ title: 'Approved author', category: 'Tech' });
    assert.equal(course.status, 201);
    assert.equal((await request(app).post('/api/categories').set(sessionHeaders(account.session)).send({ name: 'Forbidden category' })).status, 403);
    assert.equal((await request(app).post('/api/courses').set(sessionHeaders(account.session)).send({ title: 'Unknown category', category: 'Invented' })).status, 400);
    assert.equal((await request(app).post('/api/categories').set(sessionHeaders(admin)).send({ name: 'Admin category' })).status, 201);
  });
  await check('profile email changes wait for verification, then revoke old sessions', async () => {
    const account = await signup(); const target = `changed-${next}@example.test`;
    const requested = await request(app).patch('/api/profile').set(sessionHeaders(account.session)).send({ email: target, currentPassword: initialPassword });
    assert.equal(requested.status, 200); assert.equal(requested.body.user.email, account.email); assert.equal(requested.body.pendingEmail, target);
    const token = mailToken(target, 'verify-email');
    const confirmed = await post('verify-email', { token });
    assert.equal(confirmed.status, 200); assert.equal(confirmed.body.requiresSignIn, true);
    assert.equal((await profile(account.session)).status, 401); await login(target);
    assert.equal((await post('login', { email: account.email, password: initialPassword })).status, 401);
    assert(messages.some(message => message.to === account.email && message.subject.includes('email was changed')));
  });
  await check('suspension revokes sessions permanently, including after restoration', async () => {
    const account = await signup(); const admin = await login('auth-admin@example.test');
    assert.equal((await request(app).patch(`/api/users/${account.user._id}`).set(sessionHeaders(admin)).send({ status: 'suspended' })).status, 200);
    assert.equal((await profile(account.session)).status, 401);
    assert.equal((await request(app).patch(`/api/users/${account.user._id}`).set(sessionHeaders(admin)).send({ status: 'active' })).status, 200);
    assert.equal((await profile(account.session)).status, 401); await login(account.email);
  });
  await check('recovery and verification endpoints enforce rate limits', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await post('forgot-password', { email: 'unknown@example.test' })).status, 200);
    assert.equal((await post('forgot-password', { email: 'unknown@example.test' })).status, 429);
  });
} finally {
  await ctx.close();
  console.log(`Session/recovery verification: ${passed} passed, ${failed} failed. Temporary schema and outbox removed.`);
}
if (failed) process.exitCode = 1;
