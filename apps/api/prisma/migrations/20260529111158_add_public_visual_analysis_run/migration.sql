-- CreateTable
CREATE TABLE "PublicVisualAnalysisRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "finalUrl" TEXT,
    "statusCode" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "screenshotPath" TEXT,
    "screenshotHash" TEXT,
    "screenshotWidth" INTEGER,
    "screenshotHeight" INTEGER,
    "title" TEXT,
    "metaDescription" TEXT,
    "h1TextsJson" JSONB,
    "visibleText" TEXT,
    "visibleTextHash" TEXT,
    "ruleSiteCategory" TEXT,
    "rulePurposeSummary" TEXT,
    "ruleLanguage" TEXT,
    "ruleSignalsJson" JSONB,
    "ruleRiskLevel" TEXT,
    "aiVisualAnalysisJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PublicVisualAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicVisualAnalysisRun_userId_createdAt_idx" ON "PublicVisualAnalysisRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PublicVisualAnalysisRun_status_idx" ON "PublicVisualAnalysisRun"("status");

-- AddForeignKey
ALTER TABLE "PublicVisualAnalysisRun" ADD CONSTRAINT "PublicVisualAnalysisRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
