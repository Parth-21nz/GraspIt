import 'dotenv/config';
import { prisma } from '../server/db.ts';
import { loadConfig } from '../server/config.ts';
import { createImageStorage } from '../server/storage.ts';
import { cleanupUploads } from '../server/uploads.ts';

async function main() {
  const config = loadConfig();
  const report = await cleanupUploads(prisma, config.databaseSchema, createImageStorage(config));
  console.log(report);
  if (report.failed) process.exitCode = 1;
}
main().catch(() => { console.error('Upload cleanup failed. Run it again to retry.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
