// One-time migration: copies the old JSON database into PostgreSQL.
//
//   npm run db:import                      # reads $DATA_DIR/graspit-db.json (default .data/)
//   npm run db:import -- path/to/file.json # or an explicit file
//
// Safe to re-run (existing rows are skipped). Run `prisma migrate deploy` first.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../server/db.ts';
import { importDatabase } from '../server/importData.ts';
import { IMAGE_MIGRATION_MAP } from '../server/legacyImages.ts';
import type { GraspItDatabase } from '../server/dbTypes.ts';

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), '.data');
const file = path.resolve(process.argv[2] ?? path.join(dataDir, 'graspit-db.json'));

async function main() {
  if (!fs.existsSync(file)) {
    console.error(`No JSON database found at ${file}`);
    process.exit(1);
  }
  let raw = fs.readFileSync(file, 'utf-8');
  for (const [oldPath, newPath] of Object.entries(IMAGE_MIGRATION_MAP)) {
    raw = raw.split(oldPath).join(newPath);
  }
  raw = raw.split('/src/assets/images/').join('/images/');

  const data = JSON.parse(raw) as Partial<GraspItDatabase>;
  console.log(`Importing ${file} ...`);
  const report = await importDatabase(prisma, data);
  const { warnings, ...counts } = report;
  console.log('Rows submitted (existing rows are skipped):', counts);
  if (warnings.length) {
    console.warn(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(' -', w);
  }
  console.log('\nDone. Your JSON file was not modified; keep it as a backup.');
}

main()
  .catch((err) => {
    console.error('Import failed (nothing was written):', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
