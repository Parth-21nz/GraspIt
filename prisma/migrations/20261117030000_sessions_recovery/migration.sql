BEGIN;
CREATE TYPE "InstructorApplicationStatus" AS ENUM ('none', 'pending', 'approved', 'rejected');
CREATE TYPE "AuthActionPurpose" AS ENUM ('resetPassword', 'verifyEmail', 'changeEmail');
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3), ADD COLUMN "instructorApplicationStatus" "InstructorApplicationStatus" NOT NULL DEFAULT 'none';
UPDATE "User" SET "instructorApplicationStatus" = 'approved' WHERE "role" = 'instructor';
CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY, "tokenHash" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE TABLE "AuthAction" (
  "id" TEXT NOT NULL PRIMARY KEY, "tokenHash" TEXT NOT NULL, "userId" TEXT NOT NULL, "purpose" "AuthActionPurpose" NOT NULL, "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3),
  CONSTRAINT "AuthAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AuthAction_tokenHash_key" ON "AuthAction"("tokenHash");
CREATE INDEX "AuthAction_userId_purpose_idx" ON "AuthAction"("userId", "purpose");
CREATE INDEX "AuthAction_expiresAt_idx" ON "AuthAction"("expiresAt");
COMMIT;
