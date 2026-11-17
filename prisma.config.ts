import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `prisma generate` doesn't connect, so a placeholder keeps installs/builds
    // working before DATABASE_URL is set. Migrations and the app need the real one.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
