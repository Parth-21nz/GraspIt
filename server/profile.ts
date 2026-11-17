import { Prisma, type PrismaClient } from '../generated/prisma/client.ts';
import type { ProfileUpdate } from '../src/types.ts';
import { HttpError } from './errors.ts';
import { verifyPassword } from './password.ts';
import { SEED_USER_IDS } from './seed.ts';
import { resolveAvatar } from './uploads.ts';

export const emailChangeAllowed = (userId: string) => !SEED_USER_IDS.includes(userId);

export async function updateProfile(prisma: PrismaClient, schema: string, userId: string, input: ProfileUpdate) {
  try {
    return await prisma.$transaction(async (tx) => {
      const table = Prisma.raw(`"${schema.replace(/"/g, '""')}"."User"`);
      await tx.$queryRaw`SELECT id FROM ${table} WHERE id = ${userId} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: userId } });
      if (!current || current.status !== 'active') throw new HttpError(401, 'Please sign in to continue.');
      if (input.email !== undefined && input.email !== current.email) {
        if (!emailChangeAllowed(userId)) throw new HttpError(400, 'The shared demo email cannot be changed. Use a personal account to edit your sign-in email.');
        if (!input.currentPassword || !verifyPassword(input.currentPassword, current.password)) throw new HttpError(400, 'Enter your correct current password to change your email.');
      }
      const avatar = await resolveAvatar(tx, schema, userId, input.avatarAssetId);
      return tx.user.update({ where: { id: userId }, data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...avatar,
      } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new HttpError(409, 'That email address is already in use.');
    throw err;
  }
}
