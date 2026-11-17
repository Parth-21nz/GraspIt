import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Point it at a PostgreSQL database, e.g. ' +
      'postgresql://user:password@localhost:5432/graspit (see .env.example).'
  );
}

// Driver adapters do not read Prisma's ?schema= URL parameter themselves.
// Keep runtime queries in the same schema used by Prisma Migrate.
export const databaseSchema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 },
  { schema: databaseSchema }
);

export const prisma = new PrismaClient({
  adapter,
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
});
