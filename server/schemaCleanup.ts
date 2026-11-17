import type pg from 'pg';

export const CLEANUP_MIGRATION = '20261117010000_schema_cleanup';
export const retiredColumns = {
  Course: ['slug', 'rating', 'instructorAvatar', 'instructorName', 'instructorRole'],
  Category: ['slug'],
  Mentor: ['coursesCount'],
  UploadAsset: ['mimeType'],
} as const;

/** Only the retired values and row ids are copied; no passwords or tokens. */
export async function captureCleanupBackup(client: pg.Client, schema: string) {
  const quotedSchema = `"${schema.replace(/"/g, '""')}"`;
  const rows: Record<string, Record<string, unknown>[]> = {};
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    for (const [model, columns] of Object.entries(retiredColumns)) {
      const selection = ['id', ...columns].map((column) => `"${column}"`).join(', ');
      rows[model] = (await client.query(`SELECT ${selection} FROM ${quotedSchema}."${model}" ORDER BY "id"`)).rows;
    }
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  return { migration: CLEANUP_MIGRATION, schema, capturedAt: new Date().toISOString(), retiredColumns, rows };
}
