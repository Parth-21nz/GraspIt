import 'dotenv/config';
import { prisma } from '../server/db.ts';
import { loadConfig } from '../server/config.ts';
import { createImageStorage } from '../server/storage.ts';
import { migrateDataUriCovers } from '../server/imageMaintenance.ts';

async function main() {
  const config = loadConfig();
  const report = await migrateDataUriCovers(prisma, config.databaseSchema, createImageStorage(config), process.argv.includes('--dry-run'));
  console.log(report);
  if (report.failed) process.exitCode = 1;
}
main().catch(() => { console.error('Image migration failed. Existing covers were preserved.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
