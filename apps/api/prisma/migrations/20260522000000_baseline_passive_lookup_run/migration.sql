-- Baseline migration: captures schema changes that were applied to the DB
-- (via prisma db push or manual SQL) without a recorded migration. This file
-- documents the historical state so that `prisma migrate dev` from this point
-- forward stays in sync. It is marked applied via `prisma migrate resolve
-- --applied`, so this SQL is NOT executed on the existing DB — it only runs
-- when a fresh database is brought up from migrations.

-- CreateEnum: ScanRunStatus (ScanRun.status was previously TEXT)
CREATE TYPE "ScanRunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- Convert ScanRun.status from TEXT to ScanRunStatus enum
ALTER TABLE "ScanRun" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ScanRun" ALTER COLUMN "status" TYPE "ScanRunStatus" USING "status"::"ScanRunStatus";
ALTER TABLE "ScanRun" ALTER COLUMN "status" SET DEFAULT 'RUNNING';

-- CreateTable: PassiveLookupRun
CREATE TABLE "PassiveLookupRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'OTX',
    "status" TEXT NOT NULL DEFAULT 'DONE',
    "otxJson" JSONB,
    "aiSummary" TEXT,
    "aiRecommendations" JSONB,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassiveLookupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: PassiveLookupRun indexes
CREATE INDEX "PassiveLookupRun_userId_idx" ON "PassiveLookupRun"("userId");
CREATE INDEX "PassiveLookupRun_userId_checkedAt_idx" ON "PassiveLookupRun"("userId", "checkedAt");
CREATE INDEX "PassiveLookupRun_target_idx" ON "PassiveLookupRun"("target");

-- AddForeignKey: PassiveLookupRun → User
ALTER TABLE "PassiveLookupRun"
    ADD CONSTRAINT "PassiveLookupRun_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex: additional indexes captured from production
CREATE INDEX "Asset_status_idx" ON "Asset"("status");
CREATE INDEX "Finding_type_idx" ON "Finding"("type");
CREATE INDEX "ScanRun_assetId_startedAt_idx" ON "ScanRun"("assetId", "startedAt");
