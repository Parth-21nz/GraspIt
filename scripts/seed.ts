import 'dotenv/config';
import { prisma } from '../server/db.ts';
import { seedDemo } from '../server/seed.ts';

seedDemo(prisma, process.env.DEMO_MODE === 'true')
  .then((report) => console.log('Demo seed complete:', report))
  .catch((err) => { console.error(err instanceof Error ? err.message : 'Seed failed.'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
