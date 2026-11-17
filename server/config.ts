import crypto from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

const boolean = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');
const origins = (value: string) => value.split(',').map((v) => v.trim()).filter(Boolean);
const environment = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().refine((v) => { try { return ['postgres:', 'postgresql:'].includes(new URL(v).protocol); } catch { return false; } }, 'Use a PostgreSQL connection URL.'),
  AUTH_SECRET: z.string().optional(),
  DEMO_MODE: boolean,
  PAYMENTS_MODE: z.enum(['disabled', 'mock', 'razorpay_test']).default('disabled'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_ORIGIN: z.url().default('http://localhost:3000'),
  // Default to direct connections. Set explicit proxy IPs/subnets when deploying.
  TRUST_PROXY: z.string().default('false'),
  IMAGE_STORAGE: z.enum(['local', 'cloudinary']).default('local'),
  UPLOAD_DIR: z.string().min(1).default('.data/uploads'),
  CLOUDINARY_CLOUD_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  CLOUDINARY_FOLDER: z.string().regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/).default('graspit'),
  VIDEO_ORIGINS: z.string().default('https://www.youtube.com,https://youtube.com,https://youtu.be,https://www.youtube-nocookie.com,https://vimeo.com,https://player.vimeo.com'),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = environment.safeParse(env);
  if (!result.success) {
    // Report field names/messages only, never environment values or credentials.
    throw new Error(`Invalid configuration: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const e = result.data;
  if (e.NODE_ENV !== 'development' && (!e.AUTH_SECRET || e.AUTH_SECRET.length < 32 || /change-me|placeholder|replace-me/i.test(e.AUTH_SECRET))) {
    throw new Error('AUTH_SECRET must be a stable random secret of at least 32 characters outside development.');
  }
  if (e.PAYMENTS_MODE === 'razorpay_test') throw new Error('Razorpay is not implemented yet. Set PAYMENTS_MODE=disabled or mock.');
  const publicUrl = new URL(e.PUBLIC_ORIGIN);
  const normalizeOrigin = (v: string) => {
    const u = new URL(v);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('Configure HTTP(S) origins without paths or credentials.');
    return u.origin;
  };
  const publicOrigin = normalizeOrigin(e.PUBLIC_ORIGIN);
  if (e.NODE_ENV === 'production' && publicUrl.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname)) throw new Error('PUBLIC_ORIGIN must use HTTPS outside localhost in production.');
  if (e.TRUST_PROXY === 'true' || /^\d+$/.test(e.TRUST_PROXY)) throw new Error('TRUST_PROXY must be false or explicit trusted proxy IPs/subnets, not an unrestricted boolean/hop count.');
  const trustProxy: false | string[] = e.TRUST_PROXY === 'false' ? false : origins(e.TRUST_PROXY);
  if (Array.isArray(trustProxy) && trustProxy.length === 0) throw new Error('TRUST_PROXY must name trusted proxy IPs/subnets.');
  if (e.IMAGE_STORAGE === 'cloudinary' && (!e.CLOUDINARY_CLOUD_NAME || !e.CLOUDINARY_API_KEY || !e.CLOUDINARY_API_SECRET)) throw new Error('Cloudinary storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  return {
    nodeEnv: e.NODE_ENV, databaseUrl: e.DATABASE_URL,
    databaseSchema: new URL(e.DATABASE_URL).searchParams.get('schema') || 'public',
    authSecret: e.AUTH_SECRET || crypto.randomBytes(32).toString('hex'),
    demoMode: e.DEMO_MODE, paymentsMode: e.PAYMENTS_MODE as 'disabled' | 'mock',
    port: e.PORT, publicOrigin, trustProxy,
    videoOrigins: origins(e.VIDEO_ORIGINS).map(normalizeOrigin),
    imageStorage: e.IMAGE_STORAGE, uploadDir: path.resolve(e.UPLOAD_DIR),
    cloudinary: { cloud_name: e.CLOUDINARY_CLOUD_NAME, api_key: e.CLOUDINARY_API_KEY, api_secret: e.CLOUDINARY_API_SECRET, folder: e.CLOUDINARY_FOLDER },
  };
}
export type AppConfig = ReturnType<typeof loadConfig>;
