BEGIN;

-- The upload pipeline only persists re-encoded WebP images. Refuse to drop
-- format information if another writer has stored an unsupported format.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "UploadAsset" WHERE "mimeType" IS DISTINCT FROM 'image/webp') THEN
    RAISE EXCEPTION 'Schema cleanup requires all uploaded assets to be WebP. Resolve non-WebP assets before retrying.';
  END IF;
END $$;

ALTER TABLE "Course" DROP COLUMN "slug", DROP COLUMN "rating", DROP COLUMN "instructorAvatar", DROP COLUMN "instructorName", DROP COLUMN "instructorRole";
ALTER TABLE "Category" DROP COLUMN "slug";
ALTER TABLE "Mentor" DROP COLUMN "coursesCount";
ALTER TABLE "UploadAsset" DROP COLUMN "mimeType";

COMMIT;
