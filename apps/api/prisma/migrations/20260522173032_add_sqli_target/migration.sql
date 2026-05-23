-- CreateTable
CREATE TABLE "SqliTarget" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "paramsJson" JSONB NOT NULL,
    "injectParam" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SqliTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SqliTarget_assetId_idx" ON "SqliTarget"("assetId");

-- CreateIndex
CREATE INDEX "SqliTarget_assetId_enabled_idx" ON "SqliTarget"("assetId", "enabled");

-- AddForeignKey
ALTER TABLE "SqliTarget" ADD CONSTRAINT "SqliTarget_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
