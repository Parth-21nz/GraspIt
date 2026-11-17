import type { PrismaClient } from '../generated/prisma/client.ts';
import type { ImageStorage } from './storage.ts';
import { MAX_IMAGE_BYTES, persistImage, resolveThumbnail } from './uploads.ts';

/** Compare-and-set updates make reruns safe and preserve concurrent course edits. */
export async function migrateDataUriCovers(prisma: PrismaClient, schema: string, storage: ImageStorage, dryRun = false) {
  const courses = await prisma.course.findMany({ where: { thumbnail: { startsWith: 'data:' } }, select: { id: true, thumbnail: true, instructorId: true } });
  let migrated = 0;
  let failed = 0;
  let changed = 0;
  for (const course of courses) {
    if (dryRun) continue;
    try {
      const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(course.thumbnail);
      if (!match || match[1].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Error('Invalid or oversized data URI.');
      const asset = await persistImage(prisma, storage, course.instructorId, Buffer.from(match[1], 'base64'));
      const result = await prisma.$transaction(async (tx) => {
        const cover = await resolveThumbnail(tx, schema, { id: course.instructorId, role: 'instructor' }, { thumbnailAssetId: asset._id });
        return tx.course.updateMany({ where: { id: course.id, thumbnail: course.thumbnail }, data: cover });
      });
      if (result.count) migrated++; else changed++;
    } catch { failed++; console.error('Cover migration failed; original preserved for course', course.id); }
  }
  return { found: courses.length, migrated, changedDuringMigration: changed, failed, dryRun };
}
