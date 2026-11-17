import { z } from 'zod';
import type { RequestHandler } from 'express';
import type { AppConfig } from './config.ts';

const id = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const text = (length: number) => z.string().trim().max(length);
const nonempty = (length: number) => text(length).min(1);
const int = z.number().int().min(0).max(2_147_483_647);
const strings = (count = 50, length = 300) => z.array(text(length)).max(count);
const fixture = /^\/images\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(?:jpe?g|png|webp)$/i;

export function routeSchemas(config: AppConfig) {
  const videoUrl = text(2000).refine((v) => {
    if (v === '') return true;
    try { const u = new URL(v); return !u.username && !u.password && config.videoOrigins.includes(u.origin); } catch { return false; }
  }, 'Use a video URL from an allowed provider.');
  const thumbnail = text(2048).refine((v) => {
    if (v === '' || fixture.test(v)) return true;
    if (/^\/uploads\/upl_[a-f0-9]{32}\.webp$/.test(v)) return true;
    try { const u = new URL(v); return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && !u.username && !u.password; } catch { return false; }
  }, 'Upload a JPEG, PNG or WebP image instead of submitting image data or an arbitrary URL.');
  const lesson = z.object({ _id: id.optional(), title: text(200), durationMinutes: int.optional(), videoUrl: videoUrl.optional(), summary: text(5000).optional(), keyTakeaways: strings(20, 500).optional() });
  const module = z.object({ _id: id.optional(), title: text(200), lessons: z.array(lesson).max(200).default([]) });
  const courseFields = {
    title: nonempty(200), subtitle: text(500), category: nonempty(80), level: z.enum(['Foundation', 'Intermediate', 'Principal']),
    price: int, durationHours: z.number().positive().max(100_000), thumbnail, thumbnailAssetId: id.nullable(),
    instructorSignature: text(100), skills: strings(), outcomes: strings(), modules: z.array(module).max(100),
  };
  const course = z.object(courseFields).partial();
  return {
    params: z.object({ id }),
    login: z.object({ email: z.email().max(200).transform((v) => v.toLowerCase()), password: z.string().min(1).max(1024) }),
    signup: z.object({ name: nonempty(100), email: z.email().max(200).transform((v) => v.toLowerCase()), password: z.string().min(8).max(128), role: z.enum(['student', 'instructor', 'admin']).optional(), title: text(100).optional(), bio: text(500).optional() }),
    category: z.object({ name: nonempty(80), description: text(300).optional() }),
    courseCreate: course.extend({ title: nonempty(200), category: nonempty(80), instructorId: id.optional() }),
    courseEdit: course.extend({ status: z.enum(['draft', 'pending', 'published']).optional(), featured: z.boolean().optional(), studentsCount: int.optional(), instructorId: id.optional() }),
    enrollment: z.object({ courseId: id }),
    progress: z.object({ lessonId: id }),
    note: z.object({ courseId: id, lessonId: id, content: nonempty(5000), lessonTitle: text(200).optional(), timestampFormatted: text(20).optional() }),
    user: z.object({ role: z.enum(['student', 'instructor', 'admin']).optional(), status: z.enum(['active', 'suspended']).optional() }).refine((v) => v.role !== undefined || v.status !== undefined, 'Provide a role or status.'),
    profile: z.object({
      name: nonempty(100).optional(), title: text(100).optional(), bio: text(500).optional(),
      email: z.string().trim().pipe(z.email().max(200)).transform((v) => v.toLowerCase()).optional(),
      currentPassword: z.string().max(1024).optional(), avatarAssetId: id.nullable().optional(),
    }).strict().refine((v) => (['name', 'title', 'bio', 'email', 'avatarAssetId'] as const).some((key) => v[key] !== undefined), 'Provide at least one profile field.'),
    inquiry: z.object({ name: nonempty(100), email: z.email().max(200), topic: text(200).optional(), message: nonempty(5000) }),
    empty: z.object({}),
  };
}

export function validate(schema: z.ZodType, source: 'body' | 'params' = 'body'): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(source === 'body' ? req.body ?? {} : req.params);
    if (!result.success) {
      res.status(400).json({ error: 'Please check the submitted fields.', issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
      return;
    }
    if (source === 'body') req.body = result.data;
    next();
  };
}
