import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { testDatabase } from './test-database.ts';
import { captureCleanupBackup, retiredColumns } from '../server/schemaCleanup.ts';
import { courseInclude, toCourseDoc } from '../server/mappers.ts';

const ctx = await testDatabase({ migrate: false });
const { sql, schema, db } = ctx;
let passed = 0;
const runSql = async (migration: string) => sql.query(await fs.readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
const insert = async (model: string, data: Record<string, unknown>) => {
  const keys = Object.keys(data);
  await sql.query(`INSERT INTO "${model}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(data));
};
try {
  await sql.query(`SET search_path TO "${schema}"`);
  await runSql('20261114000000_init');
  await runSql('20261117000000_foundation_uploads');
  await insert('User', { id: 'upgrade_author', name: 'Current instructor', email: 'upgrade@example.test', password: 'locked', role: 'instructor', title: 'Current title' });
  await insert('Category', { id: 'upgrade_category', name: 'Upgrade', slug: 'old-category-route', createdByRole: 'admin' });
  await insert('Mentor', { id: 'upgrade_mentor', name: 'Mentor', role: 'Teacher', organization: 'Demo', signatureQuote: 'Keep learning', bio: 'A mentor', avatar: '/images/mentor.jpg', specialties: ['TypeScript'], studentsMentored: '10', coursesCount: 12 });
  await insert('UploadAsset', { id: 'upgrade_asset', ownerId: 'upgrade_author', provider: 'local', providerId: 'upgrade.webp', url: '/uploads/upgrade.webp', bytes: 25, mimeType: 'image/webp', width: 4, height: 4 });
  await insert('Course', { id: 'upgrade_course', title: 'Retained course', slug: 'old-course-route', category: 'Upgrade', price: 99, rating: 4.2, studentsCount: 3, instructorId: 'upgrade_author', instructorName: 'Stale copied name', instructorRole: 'Stale copied title', instructorSignature: 'Custom certificate signature', instructorAvatar: '/images/copied-avatar.jpg', thumbnail: '/uploads/upgrade.webp', thumbnailAssetId: 'upgrade_asset', skills: ['Databases'], outcomes: ['Understand migrations'], updatedAt: new Date() });
  const backup = await captureCleanupBackup(sql, schema);
  assert.equal(backup.rows.Course[0].instructorName, 'Stale copied name');
  assert.equal(backup.rows.Course[0].rating, 4.2);
  assert.equal(backup.rows.UploadAsset[0].mimeType, 'image/webp');
  passed++; console.log('PASS retired-field backup captures original values without credentials');

  const before: Record<string, unknown[]> = {};
  for (const [model, columns] of Object.entries(retiredColumns)) before[model] = (await sql.query(`SELECT to_jsonb(r) - $1::text[] AS retained FROM "${model}" r ORDER BY id`, [columns])).rows;
  await sql.query('UPDATE "UploadAsset" SET "mimeType" = $1', ['image/png']);
  await assert.rejects(runSql('20261117010000_schema_cleanup'), /all uploaded assets to be WebP/);
  await sql.query('ROLLBACK');
  assert.equal((await sql.query('SELECT "slug", "rating" FROM "Course"')).rows[0].rating, 4.2);
  await sql.query('UPDATE "UploadAsset" SET "mimeType" = $1', ['image/webp']);
  passed++; console.log('PASS cleanup refuses to erase non-WebP format information and leaves the old schema intact');

  await runSql('20261117010000_schema_cleanup');
  await runSql('20261117020000_profile_avatar');
  for (const [model, columns] of Object.entries(retiredColumns)) {
    assert.deepEqual((await sql.query(`SELECT to_jsonb(r) AS retained FROM "${model}" r ORDER BY id`)).rows, before[model]);
    const remaining = (await sql.query('SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = ANY($3::text[])', [schema, model, columns])).rows;
    assert.deepEqual(remaining, []);
  }
  passed++; console.log('PASS populated-schema upgrade preserves every retained field and removes all eight retired columns');

  const course = toCourseDoc(await db.course.findUniqueOrThrow({ where: { id: 'upgrade_course' }, include: courseInclude }), true);
  assert.equal(course.instructorName, 'Current instructor'); assert.equal(course.instructorRole, 'Current title');
  assert.equal(course.instructorSignature, 'Custom certificate signature');
  for (const key of ['slug', 'rating', 'instructorAvatar']) assert(!(key in course));
  await runSql('20261117030000_sessions_recovery');
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: 'upgrade_author' } })).avatarAssetId, null);
  passed++; console.log('PASS course authors come from the profile while the custom certificate signature survives');
} finally {
  await ctx.close();
  console.log(`Schema cleanup verification: ${passed} checks passed. Temporary schema removed.`);
}
