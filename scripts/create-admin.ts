import 'dotenv/config';
import { prisma } from '../server/db.ts';
import { provisionAdmin } from '../server/admin.ts';
import { HttpError } from '../server/errors.ts';

async function main() {
  await provisionAdmin(prisma, { name: process.env.ADMIN_NAME, email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  console.log('Administrator created. Sign in using the supplied email and password.');
}
main().catch((err) => { console.error(err instanceof HttpError ? err.message : 'Admin creation failed. No credentials were logged.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
