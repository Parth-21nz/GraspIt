ALTER TABLE "User" ADD COLUMN "avatarAssetId" TEXT;
CREATE INDEX "User_avatarAssetId_idx" ON "User"("avatarAssetId");
ALTER TABLE "User" ADD CONSTRAINT "User_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "UploadAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
