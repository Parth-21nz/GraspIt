import type { PrismaClient } from '../generated/prisma/client.ts';
import { importDatabase } from './importData.ts';
import { SEED_DATA } from './seedData.ts';
import { hashPassword } from './password.ts';

export const SEED_USER_IDS = SEED_DATA.users.map((u) => u._id);

export async function seedDemo(prisma: PrismaClient, demoMode: boolean) {
  if (!demoMode) throw new Error('Demo seeding requires DEMO_MODE=true and a disposable demo database.');
  // Reject collisions before reopening publicly known sample credentials.
  for (const u of SEED_DATA.users) {
    const existing = await prisma.user.findFirst({ where: { OR: [{ id: u._id }, { email: u.email }] } });
    if (existing && (existing.email !== u.email || existing.id !== u._id)) throw new Error('Demo account identity conflict.');
  }
  const report = await importDatabase(prisma, SEED_DATA);
  for (const u of SEED_DATA.users) {
    await prisma.user.updateMany({ where: { id: u._id, email: u.email }, data: { password: hashPassword(u.password!), role: u.role, status: 'active' } });
  }
  return report;
}
