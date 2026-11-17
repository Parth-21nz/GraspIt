CREATE TYPE "EnrollmentPaymentMode" AS ENUM ('legacy', 'free', 'mock');
CREATE TYPE "UploadProvider" AS ENUM ('local', 'cloudinary');
CREATE TYPE "UploadState" AS ENUM ('ready', 'deleting');

ALTER TABLE "Enrollment" ADD COLUMN "paymentMode" "EnrollmentPaymentMode" NOT NULL DEFAULT 'legacy';

CREATE TABLE "UploadAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "provider" "UploadProvider" NOT NULL,
    "providerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "state" "UploadState" NOT NULL DEFAULT 'ready',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UploadAsset_provider_providerId_key" ON "UploadAsset"("provider", "providerId");
CREATE INDEX "UploadAsset_ownerId_idx" ON "UploadAsset"("ownerId");
CREATE INDEX "UploadAsset_state_createdAt_idx" ON "UploadAsset"("state", "createdAt");
ALTER TABLE "UploadAsset" ADD CONSTRAINT "UploadAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Course" ADD COLUMN "thumbnailAssetId" TEXT;
CREATE INDEX "Course_thumbnailAssetId_idx" ON "Course"("thumbnailAssetId");
ALTER TABLE "Course" ADD CONSTRAINT "Course_thumbnailAssetId_fkey" FOREIGN KEY ("thumbnailAssetId") REFERENCES "UploadAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
