import fs from 'node:fs/promises';
import path from 'node:path';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import type { AppConfig } from './config.ts';

export interface ImageStorage {
  provider: 'local' | 'cloudinary';
  save(id: string, image: Buffer): Promise<{ providerId: string; url: string }>;
  delete(providerId: string): Promise<void>;
}

export function createImageStorage(config: AppConfig): ImageStorage {
  if (config.imageStorage === 'cloudinary') {
    // Pass credentials per request; never mutate global SDK configuration.
    // Prefix the public id once. Passing `folder` as well would prepend it
    // again on fixed-folder Cloudinary accounts and break later deletion.
    const { folder, ...credentials } = config.cloudinary;
    const options = { ...credentials, resource_type: 'image' as const };
    return {
      provider: 'cloudinary',
      async save(id, image) {
        const uploaded = await new Promise<UploadApiResponse>((resolve, reject) => {
          cloudinary.uploader.upload_stream({ ...options, public_id: `${folder}/${id}`, overwrite: false, format: 'webp', timeout: 30_000 }, (err, result) => {
            if (err || !result) reject(new Error('Image storage is unavailable. Please retry.'));
            else resolve(result);
          }).end(image);
        });
        return { providerId: uploaded.public_id, url: uploaded.secure_url };
      },
      async delete(providerId) {
        if (!providerId.startsWith(`${config.cloudinary.folder}/upl_`)) throw new Error('Unexpected Cloudinary asset id.');
        const deleteOptions = { ...options, invalidate: true, timeout: 30_000 };
        const result = await cloudinary.uploader.destroy(providerId, deleteOptions);
        if (!['ok', 'not found'].includes(result.result)) throw new Error('Cloudinary deletion failed.');
      },
    };
  }
  const localPath = (filename: string) => {
    if (!/^upl_[a-f0-9]{32}\.webp$/.test(filename)) throw new Error('Invalid local asset id.');
    const resolved = path.resolve(config.uploadDir, filename);
    if (path.dirname(resolved) !== config.uploadDir) throw new Error('Asset path escaped the upload directory.');
    return resolved;
  };
  return {
    provider: 'local',
    async save(id, image) {
      const filename = `${id}.webp`;
      const target = localPath(filename);
      await fs.mkdir(config.uploadDir, { recursive: true });
      await fs.writeFile(target, image, { flag: 'wx' });
      return { providerId: filename, url: `/uploads/${filename}` };
    },
    async delete(providerId) { await fs.rm(localPath(providerId), { force: true }); },
  };
}
