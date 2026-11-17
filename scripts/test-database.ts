import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { loadConfig } from '../server/config.ts';

export async function testDatabase(options: { migrate?: boolean } = {}) {
  assert(process.env.DATABASE_URL, 'DATABASE_URL is required.');
  const schema = `graspit_verify_${crypto.randomBytes(8).toString('hex')}`;
  assert(/^graspit_verify_[a-f0-9]{16}$/.test(schema));
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('schema', schema);
  const uploadDir = path.resolve('.data', schema);
  const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString(), AUTH_SECRET: crypto.randomBytes(32).toString('hex'), NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://localhost:3000', TRUST_PROXY: 'false', IMAGE_STORAGE: 'local', UPLOAD_DIR: uploadDir, MAIL_MODE: 'outbox', MAIL_OUTBOX_DIR: path.join(uploadDir, 'mail'), PAYMENTS_MODE: 'disabled', DEMO_MODE: 'false' };
  const sql = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  // Remote databases can terminate an idle administrative connection while
  // browser/API work continues through Prisma's pool. Queries still reject;
  // an idle error must not crash the process and bypass fixture cleanup.
  sql.on('error', () => {});
  const dropSchema = async () => {
    const cleanup = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
    await cleanup.connect();
    try { await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await cleanup.end(); }
  };
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), connectionTimeoutMillis: 10_000 }, { schema }), transactionOptions: { maxWait: 10_000, timeout: 30_000 } });
  await sql.connect();
  try {
    await sql.query(`CREATE SCHEMA "${schema}"`);
    if (options.migrate !== false) {
      const migrated = spawnSync(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env, encoding: 'utf8', timeout: 120_000, windowsHide: true });
      assert.equal(migrated.status, 0, `Test migration failed: ${migrated.stderr}\n${migrated.stdout}`);
    }
  } catch (err) {
    await dropSchema();
    await sql.end().catch(() => {});
    throw err;
  }
  return {
    db, sql, schema, env, config: loadConfig(env), uploadDir,
    async close() {
      await db.$disconnect();
      await dropSchema();
      await sql.end().catch(() => {});
      const resolved = path.resolve(uploadDir);
      assert.equal(path.dirname(resolved), path.resolve('.data'));
      assert.equal(path.basename(resolved), schema);
      await fs.rm(resolved, { recursive: true, force: true });
    },
  };
}
