import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.ts';
import { HttpError } from './errors.ts';
import { hashPassword, newId } from './password.ts';

export async function provisionAdmin(prisma: PrismaClient, input: unknown) {
  const parsed = z.object({ name: z.string().trim().min(1).max(100), email: z.email().max(200).transform((v) => v.toLowerCase()), password: z.string().min(12).max(128) }).safeParse(input);
  if (!parsed.success) throw new HttpError(400, 'Supply a name, valid email and password of at least 12 characters.');
  const { name, email, password } = parsed.data;
  if (email.endsWith('@graspit.dev')) throw new HttpError(400, 'Use a non-demo email for the administrator.');
  if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(409, 'That email already exists. No account was changed.');
  return prisma.user.create({ data: { id: newId('usr'), name, email, password: hashPassword(password), role: 'admin' }, select: { id: true, email: true } });
}
