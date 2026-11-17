import crypto from 'node:crypto';
import Busboy from 'busboy';
import sharp, { type Metadata } from 'sharp';
import type { Request } from 'express';
import { Prisma, type PrismaClient, type Course, type User } from '../generated/prisma/client.ts';
import type { ImageStorage } from './storage.ts';
import { HttpError } from './errors.ts';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const OUTPUT_IMAGE_MIME = 'image/webp' as const;
const GRACE_MS = 24 * 60 * 60 * 1000;
const table = (schema: string) => Prisma.raw(`"${schema.replace(/"/g, '""')}"."UploadAsset"`);

export async function readMultipartImage(req: Request): Promise<Buffer> {
  if (!req.is('multipart/form-data')) throw new HttpError(415, 'Use multipart/form-data with one image in the file field.');
  if (Number(req.headers['content-length']) > MAX_IMAGE_BYTES + 64 * 1024) throw new HttpError(413, 'Images must be 5 MB or smaller.');
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    // Busboy signals partsLimit as soon as the configured count is reached.
    // Keep an extra part of headroom; files/fields limits enforce one file only.
    try { parser = Busboy({ headers: req.headers, limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2, headerPairs: 50 } }); }
    catch { reject(new HttpError(400, 'Malformed upload.')); return; }
    let chunks: Buffer[] = [];
    let received = 0;
    let found = false;
    let failed = false;
    const fail = (status: number, message: string) => { failed = true; chunks = []; reject(new HttpError(status, message)); };
    const count = (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_IMAGE_BYTES + 64 * 1024 && !failed) {
        fail(413, 'Images must be 5 MB or smaller.');
        req.unpipe(parser);
        req.resume();
      }
    };
    req.on('data', count);
    req.once('aborted', () => fail(400, 'Upload was interrupted. Please retry.'));
    req.once('error', () => fail(400, 'Upload was interrupted. Please retry.'));
    parser.on('file', (name, file, info) => {
      found = true;
      if (name !== 'file' || !['image/jpeg', 'image/png', 'image/webp'].includes(info.mimeType)) fail(415, 'Choose a JPEG, PNG or WebP image.');
      file.on('limit', () => fail(413, 'Images must be 5 MB or smaller.'));
      file.on('data', (chunk: Buffer) => { if (!failed) chunks.push(chunk); });
      file.on('error', () => fail(400, 'Malformed upload.'));
    });
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const) parser.on(event, () => fail(400, 'Upload exactly one image in the file field.'));
    parser.once('error', () => fail(400, 'Malformed upload.'));
    parser.once('close', () => {
      req.off('data', count);
      if (failed) return;
      if (!found || !chunks.length) { fail(400, 'Choose an image to upload.'); return; }
      resolve(Buffer.concat(chunks));
    });
    req.pipe(parser);
  });
}

export async function normalizeImage(input: Buffer, maxDimension: 512 | 1920 = 1920) {
  if (input.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Images must be 5 MB or smaller.');
  let info: Metadata;
  try { info = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning' }).metadata(); }
  catch { throw new HttpError(415, 'This image is invalid or exceeds the 20 megapixel limit.'); }
  if (!['jpeg', 'png', 'webp'].includes(info.format ?? '') || (info.pages ?? 1) > 1) throw new HttpError(415, 'Choose a non-animated JPEG, PNG or WebP image.');
  if (!info.width || !info.height || info.width > 8192 || info.height > 8192 || info.width * info.height > MAX_IMAGE_PIXELS) throw new HttpError(415, 'Image dimensions must be at most 8192 pixels per side and 20 megapixels.');
  try {
    // Decode, strip metadata and re-encode. SVG/HTML payloads never reach storage.
    const image = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning' })
      .rotate().resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).timeout({ seconds: 10 }).toBuffer({ resolveWithObject: true });
    if (image.data.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'The processed image is too large.');
    return { buffer: image.data, width: image.info.width, height: image.info.height };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(415, 'The image could not be decoded. Try a different image.');
  }
}

export async function persistImage(prisma: PrismaClient, storage: ImageStorage, ownerId: string, input: Buffer, maxDimension: 512 | 1920 = 1920) {
  const image = await normalizeImage(input, maxDimension);
  const id = `upl_${crypto.randomBytes(16).toString('hex')}`;
  let stored: Awaited<ReturnType<ImageStorage['save']>>;
  try { stored = await storage.save(id, image.buffer); }
  catch { throw new HttpError(503, 'Image storage is unavailable. Please retry.'); }
  try {
    const asset = await prisma.uploadAsset.create({ data: { id, ownerId, provider: storage.provider, ...stored, bytes: image.buffer.length, width: image.width, height: image.height } });
    return { _id: asset.id, url: asset.url, bytes: asset.bytes, mimeType: OUTPUT_IMAGE_MIME, width: asset.width, height: asset.height, createdAt: asset.createdAt.toISOString() };
  } catch (err) {
    try { await storage.delete(stored.providerId); } catch { console.error('Upload compensation failed for asset', id); }
    throw err;
  }
}

export async function resolveThumbnail(tx: Prisma.TransactionClient, schema: string, user: Pick<User, 'id' | 'role'>, input: { thumbnail?: unknown; thumbnailAssetId?: unknown }, current?: Pick<Course, 'thumbnail' | 'thumbnailAssetId'>) {
  if (typeof input.thumbnailAssetId === 'string') {
    await tx.$queryRaw`SELECT id FROM ${table(schema)} WHERE id = ${input.thumbnailAssetId} FOR UPDATE`;
    const asset = await tx.uploadAsset.findUnique({ where: { id: input.thumbnailAssetId } });
    if (!asset || asset.state !== 'ready') throw new HttpError(409, 'This upload is unavailable. Please upload the image again.');
    // Keeping an existing course reference is not a new attachment. An admin
    // may have assigned a course using an asset owned by a different author.
    if (asset.ownerId !== user.id && user.role !== 'admin' && current?.thumbnailAssetId !== asset.id) throw new HttpError(403, 'You can only attach your own uploaded images.');
    if (input.thumbnail !== undefined && input.thumbnail !== asset.url) throw new HttpError(400, 'The cover URL does not match the uploaded image.');
    return { thumbnail: asset.url, thumbnailAssetId: asset.id };
  }
  if (input.thumbnailAssetId === undefined && input.thumbnail === undefined) return {};
  if (input.thumbnailAssetId === undefined && current && input.thumbnail === current.thumbnail) return {};
  const thumbnail = typeof input.thumbnail === 'string' ? input.thumbnail : '';
  if (thumbnail && !/^\/images\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(?:jpe?g|png|webp)$/i.test(thumbnail)) throw new HttpError(400, 'Select an uploaded asset for the course cover.');
  return { thumbnail, thumbnailAssetId: null };
}

export async function resolveAvatar(tx: Prisma.TransactionClient, schema: string, userId: string, assetId: string | null | undefined) {
  if (assetId === undefined) return {};
  if (assetId === null) return { avatar: '', avatarAssetId: null };
  await tx.$queryRaw`SELECT id FROM ${table(schema)} WHERE id = ${assetId} FOR UPDATE`;
  const asset = await tx.uploadAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.state !== 'ready') throw new HttpError(409, 'This photo is unavailable. Please upload it again.');
  if (asset.ownerId !== userId) throw new HttpError(403, 'You can only use a photo you uploaded.');
  return { avatar: asset.url, avatarAssetId: asset.id };
}

export async function cleanupUploads(prisma: PrismaClient, schema: string, storage: ImageStorage, now = new Date()) {
  const candidates = await prisma.uploadAsset.findMany({ where: { provider: storage.provider, OR: [{ state: 'deleting' }, { createdAt: { lt: new Date(now.getTime() - GRACE_MS) }, courses: { none: {} }, profileUsers: { none: {} } }] }, select: { id: true }, take: 100 });
  let removed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const asset = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ${table(schema)} WHERE id = ${candidate.id} FOR UPDATE`;
      const row = await tx.uploadAsset.findUnique({ where: { id: candidate.id }, include: { _count: { select: { courses: true, profileUsers: true } } } });
      if (!row || row._count.courses > 0 || row._count.profileUsers > 0 || (row.state === 'ready' && row.createdAt.getTime() >= now.getTime() - GRACE_MS)) return null;
      await tx.uploadAsset.update({ where: { id: row.id }, data: { state: 'deleting' } });
      return row;
    });
    if (!asset) continue;
    try {
      await storage.delete(asset.providerId);
      await prisma.uploadAsset.delete({ where: { id: asset.id } });
      removed++;
    } catch { failed++; console.error('Upload cleanup will retry asset', asset.id); }
  }
  return { removed, failed, examined: candidates.length };
}

/** One bounded batch per hour; the explicit CLI can drain larger backlogs. */
export function startUploadMaintenance(prisma: PrismaClient, schema: string, storage: ImageStorage) {
  let pending: Promise<unknown> | undefined;
  const timer = setInterval(() => {
    if (pending) return;
    pending = cleanupUploads(prisma, schema, storage)
      .catch(() => console.error('Upload maintenance failed; it will retry.'))
      .finally(() => { pending = undefined; });
  }, 60 * 60_000).unref();
  return async () => { clearInterval(timer); await pending; };
}
