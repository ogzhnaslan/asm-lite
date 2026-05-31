-- CreateTable
CREATE TABLE "VisualAnalysisRun" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "finalUrl" TEXT,
    "statusCode" INTEGER,
    "screenshotPath" TEXT,
    "screenshotHash" TEXT,
    "screenshotWidth" INTEGER,
    "screenshotHeight" INTEGER,
    "title" TEXT,
    "metaDescription" TEXT,
    "h1TextsJson" JSONB,
    "visibleText" TEXT,
    "visibleTextHash" TEXT,
    "siteCategory" TEXT,
    "purposeSummary" TEXT,
    "language" TEXT,
    "signalsJson" JSONB,
    "analysisJson" JSONB,
    "riskLevel" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisualAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisualAnalysisRun_assetId_createdAt_idx" ON "VisualAnalysisRun"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "VisualAnalysisRun_url_idx" ON "VisualAnalysisRun"("url");

-- AddForeignKey
ALTER TABLE "VisualAnalysisRun" ADD CONSTRAINT "VisualAnalysisRun_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
