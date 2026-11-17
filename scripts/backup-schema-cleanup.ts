import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { captureCleanupBackup, CLEANUP_MIGRATION } from '../server/schemaCleanup.ts';

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL or DIRECT_URL is required.');
  const schema = new URL(connectionString).searchParams.get('schema') || 'public';
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    const snapshot = await captureCleanupBackup(client, schema);
    const directory = path.resolve('.data/backups');
    const file = path.join(directory, `${CLEANUP_MIGRATION}-${snapshot.capturedAt.replace(/[:.]/g, '-')}.json`);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(`Saved retired-column values to ${file}`);
    console.log('Rows backed up:', Object.fromEntries(Object.entries(snapshot.rows).map(([model, rows]) => [model, rows.length])));
  } finally { await client.end(); }
}

main().catch(() => { console.error('Cleanup backup failed. Do not deploy the cleanup migration until the backup succeeds; it must run before the columns are removed.'); process.exitCode = 1; });
