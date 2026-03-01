-- CreateTable
CREATE TABLE "ScanCheckResult" (
    "id" TEXT NOT NULL,
    "scanRunId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanCheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanCheckResult_scanRunId_idx" ON "ScanCheckResult"("scanRunId");

-- CreateIndex
CREATE INDEX "ScanCheckResult_type_idx" ON "ScanCheckResult"("type");

-- AddForeignKey
ALTER TABLE "ScanCheckResult" ADD CONSTRAINT "ScanCheckResult_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "ScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
