import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from './config.ts';
import { HttpError } from './errors.ts';

export interface MailMessage { to: string; subject: string; text: string }
export interface MailDelivery { send(message: MailMessage): Promise<void> }
export function createMailDelivery(config: AppConfig): MailDelivery {
  return { async send(message) {
    if (config.mailMode !== 'outbox') throw new HttpError(503, 'Email delivery is unavailable in this demonstration.');
    await fs.mkdir(config.mailOutboxDir, { recursive: true, mode: 0o700 });
    const file = path.join(config.mailOutboxDir, `${Date.now()}-${crypto.randomUUID()}.json`);
    await fs.writeFile(file, JSON.stringify({ ...message, createdAt: new Date().toISOString() }, null, 2), { flag: 'wx', mode: 0o600 });
  } };
}
