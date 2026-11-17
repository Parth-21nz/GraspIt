import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../server/config.ts';
const config = loadConfig();
if (config.mailMode !== 'outbox') throw new Error('Local mail outbox is disabled.');
const files = await fs.readdir(config.mailOutboxDir).catch(() => [] as string[]);
for (const file of files.filter(name => /^\d+-[a-f0-9-]+\.json$/.test(name)).sort().slice(-10)) {
  const message = JSON.parse(await fs.readFile(path.join(config.mailOutboxDir, file), 'utf8'));
  console.log(`\n${message.createdAt}\nTo: ${message.to}\n${message.subject}\n${message.text}`);
}
if (!files.length) console.log('No local email messages yet. Request verification or password recovery from a personal account.');
