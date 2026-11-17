import crypto from 'node:crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { Prisma, type PrismaClient, type User, type AuthActionPurpose } from '../generated/prisma/client.ts';
import type { AppConfig } from './config.ts';
import { HttpError } from './errors.ts';
import { hashPassword, verifyPassword, newId } from './password.ts';
import { SEED_USER_IDS } from './seed.ts';
import { createMailDelivery, type MailDelivery } from './mail.ts';
import { toUserDoc } from './mappers.ts';
import { routeSchemas, validate } from './validation.ts';

declare global {
  namespace Express {
    interface Request { user?: User; session?: { id: string; userId: string; csrfToken: string } }
  }
}
const sha = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
const safeEqual = (left: string, right: string) => { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const run = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { void fn(req, res).catch(next); };
const email = z.string().trim().pipe(z.email().max(200)).transform(value => value.toLowerCase());
const password = z.string().min(8).max(128);
const actionToken = z.string().regex(/^[\w-]{43}$/);
export interface EmailAction { id: string; raw: string; purpose: AuthActionPurpose; email: string }

export function createAuth(prisma: PrismaClient, config: AppConfig, mail: MailDelivery = createMailDelivery(config)) {
  const cookieName = config.secureCookies ? '__Host-graspit_session' : 'graspit_session';
  const cookieOptions = { path: '/', httpOnly: true, secure: config.secureCookies, sameSite: 'lax' as const };
  const csrf = (raw: string) => crypto.createHmac('sha256', config.authSecret).update(`csrf:${raw}`).digest('base64url');
  const cookie = (req: Request) => {
    const values = (req.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${cookieName}=`));
    return values.length === 1 ? values[0].slice(cookieName.length + 1) : '';
  };
  const clearCookie = (res: Response) => res.clearCookie(cookieName, cookieOptions);
  const lockUser = async (tx: Prisma.TransactionClient, id: string) => {
    const table = Prisma.raw(`"${config.databaseSchema.replace(/"/g, '""')}"."User"`);
    await tx.$queryRaw`SELECT id FROM ${table} WHERE id = ${id} FOR UPDATE`;
    return tx.user.findUniqueOrThrow({ where: { id } });
  };
  const usable = (user: User) => user.status === 'active' && (config.demoMode || !SEED_USER_IDS.includes(user.id));
  const personal = (user: User) => {
    if (SEED_USER_IDS.includes(user.id)) throw new HttpError(400, 'Shared demo credentials stay fixed. Use a personal account for account recovery and security changes.');
  };
  const requireUser = (req: Request) => { if (!req.user) throw new HttpError(401, 'Please sign in to continue.'); return req.user; };
  async function newSession(tx: Prisma.TransactionClient, userId: string) {
    const raw = random();
    const expiresAt = new Date(Date.now() + config.sessionDays * 86_400_000);
    await tx.session.create({ data: { id: newId('ses'), tokenHash: sha(raw), userId, expiresAt } });
    return { raw, expiresAt, csrfToken: csrf(raw) };
  }
  function setSession(res: Response, session: Awaited<ReturnType<typeof newSession>>) {
    res.cookie(cookieName, session.raw, { ...cookieOptions, expires: session.expiresAt });
  }
  async function issueAction(tx: Prisma.TransactionClient, user: User, purpose: AuthActionPurpose, targetEmail = user.email): Promise<EmailAction> {
    const raw = random();
    await tx.authAction.updateMany({ where: { userId: user.id, purpose: purpose === 'changeEmail' ? { in: ['changeEmail', 'verifyEmail'] } : purpose, usedAt: null }, data: { usedAt: new Date() } });
    const id = newId('act');
    await tx.authAction.create({ data: { id, userId: user.id, tokenHash: sha(raw), purpose, email: targetEmail, expiresAt: new Date(Date.now() + (purpose === 'verifyEmail' ? 24 * 60 : 30) * 60_000) } });
    return { id, raw, purpose, email: targetEmail };
  }
  async function sendAction(action: EmailAction) {
    const reset = action.purpose === 'resetPassword';
    const link = `${config.publicOrigin}/#${reset ? 'reset-password' : 'verify-email'}?token=${action.raw}`;
    try { await mail.send({ to: action.email, subject: reset ? 'Reset your GraspIt password' : 'Verify your GraspIt email', text: `${reset ? 'Reset your password' : 'Confirm this email address'} by opening this link:\n\n${link}\n\nThis single-use link expires in ${action.purpose === 'verifyEmail' ? '24 hours' : '30 minutes'}. If you did not request it, ignore this message.` }); }
    catch (err) { await prisma.authAction.updateMany({ where: { id: action.id }, data: { usedAt: new Date() } }); throw err; }
  }
  const originGuard: RequestHandler = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && ((req.headers.origin && req.headers.origin !== config.publicOrigin) || req.get('sec-fetch-site') === 'cross-site')) return next(new HttpError(403, 'This request origin is not allowed.'));
    next();
  };
  const authenticate: RequestHandler = (req, res, next) => { void (async () => {
    const raw = cookie(req);
    if (raw) {
      const session = /^[\w-]{43}$/.test(raw) ? await prisma.session.findUnique({ where: { tokenHash: sha(raw) }, include: { user: true } }) : null;
      if (session && !session.revokedAt && session.expiresAt > new Date() && usable(session.user)) {
        req.user = session.user; req.session = { id: session.id, userId: session.userId, csrfToken: csrf(raw) };
      } else clearCookie(res);
    }
    next();
  })().catch(next); };
  const protectWrites: RequestHandler = (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    // A custom header prevents unauthenticated form/login CSRF; CORS is not enabled.
    // Authenticated writes additionally require this session's synchronizer token.
    if (req.session ? !safeEqual(req.get('x-csrf-token') ?? '', req.session.csrfToken) : req.get('x-graspit-client') !== 'web') return next(new HttpError(403, 'Your security token is missing or expired. Reload and try again.'));
    next();
  };
  const router = Router();
  const schemas = routeSchemas(config);
  const limit = (count: number, windowMs = 15 * 60_000) => rateLimit({ limit: count, windowMs, standardHeaders: 'draft-8', legacyHeaders: false, validate: { xForwardedForHeader: config.trustProxy !== false }, message: { error: 'Too many requests. Please try again later.' } });
  router.post('/login', limit(10), validate(schemas.login), run(async (req, res) => {
    const found = await prisma.user.findUnique({ where: { email: req.body.email.trim().toLowerCase() } });
    if (!found) throw new HttpError(401, 'Invalid email or password.');
    const result = await prisma.$transaction(async tx => {
      const user = await lockUser(tx, found.id);
      if (user.email !== req.body.email.trim().toLowerCase() || !verifyPassword(req.body.password, user.password) || (!config.demoMode && SEED_USER_IDS.includes(user.id))) throw new HttpError(401, 'Invalid email or password.');
      if (!usable(user)) throw new HttpError(403, 'This account has been suspended by an administrator.');
      if (req.session) await tx.session.updateMany({ where: { id: req.session.id }, data: { revokedAt: new Date() } });
      return { user, session: await newSession(tx, user.id) };
    });
    setSession(res, result.session);
    res.json({ user: toUserDoc(result.user), csrfToken: result.session.csrfToken });
  }));
  router.post('/signup', limit(20, 60 * 60_000), validate(schemas.signup), run(async (req, res) => {
    try {
      const result = await prisma.$transaction(async tx => {
        const user = await tx.user.create({ data: { id: newId('usr'), name: req.body.name, email: req.body.email.trim().toLowerCase(), password: hashPassword(req.body.password), role: 'student', title: req.body.title ?? '', bio: req.body.bio ?? '', instructorApplicationStatus: req.body.role === 'instructor' ? 'pending' : 'none' } });
        return { user, session: await newSession(tx, user.id), action: config.mailMode === 'outbox' ? await issueAction(tx, user, 'verifyEmail') : null };
      });
      let verificationEmailSent = false;
      if (result.action) { try { await sendAction(result.action); verificationEmailSent = true; } catch { /* Account remains usable; verification can be retried from its profile. */ } }
      if (req.session) await prisma.session.updateMany({ where: { id: req.session.id }, data: { revokedAt: new Date() } });
      setSession(res, result.session);
      res.status(201).json({ user: toUserDoc(result.user), csrfToken: result.session.csrfToken, verificationEmailSent });
    } catch (err) { if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new HttpError(409, 'An account with this email already exists. Please sign in.'); throw err; }
  }));
  router.post('/logout', run(async (req, res) => {
    if (req.session) await prisma.session.updateMany({ where: { id: req.session.id }, data: { revokedAt: new Date() } });
    clearCookie(res); res.json({ ok: true });
  }));
  router.post('/logout-all', run(async (req, res) => {
    const user = requireUser(req);
    await prisma.$transaction(async tx => { await lockUser(tx, user.id); await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }); });
    clearCookie(res); res.json({ ok: true });
  }));
  router.get('/sessions', run(async (req, res) => {
    const user = requireUser(req);
    const sessions = await prisma.session.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } });
    res.json(sessions.map(session => ({ ...session, current: session.id === req.session?.id })));
  }));
  router.post('/change-password', limit(10), validate(z.object({ currentPassword: z.string().min(1).max(1024), newPassword: password }).strict()), run(async (req, res) => {
    const actor = requireUser(req); personal(actor);
    await prisma.$transaction(async tx => {
      const user = await lockUser(tx, actor.id);
      if (!usable(user)) throw new HttpError(401, 'Please sign in again.');
      if (!verifyPassword(req.body.currentPassword, user.password)) throw new HttpError(400, 'Your current password is incorrect.');
      if (verifyPassword(req.body.newPassword, user.password)) throw new HttpError(400, 'Choose a different new password.');
      await tx.user.update({ where: { id: user.id }, data: { password: hashPassword(req.body.newPassword) } });
      await tx.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
      await tx.authAction.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    });
    clearCookie(res); res.json({ message: 'Password changed. Please sign in again.' });
  }));
  router.post('/forgot-password', limit(5), validate(z.object({ email })), run(async (req, res) => {
    const started = Date.now();
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (user && usable(user) && !SEED_USER_IDS.includes(user.id) && config.mailMode === 'outbox') {
      try {
        const action = await prisma.$transaction(async tx => { const current = await lockUser(tx, user.id); if (!usable(current) || current.email !== req.body.email) return null; return issueAction(tx, current, 'resetPassword'); });
        if (action) await sendAction(action);
      } catch { /* Same response for ineligible accounts and delivery errors. */ }
    }
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 1000 - (Date.now() - started))));
    res.json({ message: 'If an eligible account exists, a password reset link has been sent.' });
  }));
  async function consume(raw: string, purpose: 'resetPassword' | 'email', newPassword?: string) {
    const found = await prisma.authAction.findUnique({ where: { tokenHash: sha(raw) } });
    if (!found) throw new HttpError(400, 'This link is invalid or expired. Request a new one.');
    return prisma.$transaction(async tx => {
      const user = await lockUser(tx, found.userId);
      const action = await tx.authAction.findUniqueOrThrow({ where: { id: found.id } });
      if (action.usedAt || action.expiresAt <= new Date() || !usable(user) || SEED_USER_IDS.includes(user.id) || (purpose === 'resetPassword' ? action.purpose !== 'resetPassword' || action.email !== user.email : action.purpose === 'resetPassword' || (action.purpose === 'verifyEmail' && action.email !== user.email))) throw new HttpError(400, 'This link is invalid or expired. Request a new one.');
      await tx.authAction.update({ where: { id: action.id }, data: { usedAt: new Date() } });
      const changedEmail = action.purpose === 'changeEmail';
      await tx.user.update({ where: { id: user.id }, data: purpose === 'resetPassword' ? { password: hashPassword(newPassword!) } : { email: action.email, emailVerifiedAt: new Date() } });
      if (purpose === 'resetPassword' || changedEmail) {
        await tx.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
        await tx.authAction.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      }
      return { changedEmail, previousEmail: user.email };
    });
  }
  router.post('/reset-password', limit(15), validate(z.object({ token: actionToken, newPassword: password }).strict()), run(async (req, res) => {
    await consume(req.body.token, 'resetPassword', req.body.newPassword);
    clearCookie(res); res.json({ message: 'Password reset. Please sign in with your new password.' });
  }));
  router.post('/resend-verification', limit(3, 60 * 60_000), run(async (req, res) => {
    const actor = requireUser(req); personal(actor);
    if (config.mailMode !== 'outbox') throw new HttpError(503, 'Email delivery is unavailable in this demonstration.');
    const action = await prisma.$transaction(async tx => { const user = await lockUser(tx, actor.id); if (!usable(user)) throw new HttpError(401, 'Please sign in again.'); return user.emailVerifiedAt ? null : issueAction(tx, user, 'verifyEmail'); });
    if (action) await sendAction(action);
    res.json({ message: 'If verification is needed, a new link has been sent.' });
  }));
  router.post('/verify-email', limit(15), validate(z.object({ token: actionToken }).strict()), run(async (req, res) => {
    try {
      const result = await consume(req.body.token, 'email');
      if (result.changedEmail) {
        clearCookie(res);
        await mail.send({ to: result.previousEmail, subject: 'Your GraspIt email was changed', text: 'Your sign-in email was changed after confirmation. All previous sessions have been signed out.' }).catch(() => {});
      }
      res.json({ message: result.changedEmail ? 'Email updated. Please sign in with your new address.' : 'Email verified. You can return to your profile.', requiresSignIn: result.changedEmail });
    } catch (err) { if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new HttpError(409, 'That email address is already in use.'); throw err; }
  }));
  router.post('/instructor-application', limit(3, 60 * 60_000), run(async (req, res) => {
    const actor = requireUser(req);
    const user = await prisma.$transaction(async tx => {
      const current = await lockUser(tx, actor.id);
      if (!usable(current)) throw new HttpError(401, 'Please sign in again.');
      if (current.role !== 'student') throw new HttpError(400, 'Your account already has management access.');
      return tx.user.update({ where: { id: current.id }, data: { instructorApplicationStatus: 'pending' } });
    });
    res.json({ user: toUserDoc(user) });
  }));
  return {
    router, originGuard, authenticate, protectWrites,
    pendingEmail: async (userId: string) => (await prisma.authAction.findFirst({ where: { userId, purpose: 'changeEmail', usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { email: true } }))?.email ?? null,
    async prepareEmailChange(tx: Prisma.TransactionClient, user: User, target: string, currentPassword?: string) {
      personal(user);
      if (!currentPassword || !verifyPassword(currentPassword, user.password)) throw new HttpError(400, 'Enter your correct current password to change your email.');
      if (config.mailMode !== 'outbox') throw new HttpError(503, 'Email delivery is unavailable in this demonstration.');
      if (await tx.user.findUnique({ where: { email: target }, select: { id: true } })) throw new HttpError(409, 'That email address is already in use.');
      return issueAction(tx, user, 'changeEmail', target);
    },
    sendAction,
  };
}
