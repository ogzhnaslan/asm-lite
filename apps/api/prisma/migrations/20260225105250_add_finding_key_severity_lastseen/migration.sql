/*
  Warnings:

  - A unique constraint covering the columns `[assetId,key]` on the table `Finding` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `key` to the `Finding` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "severity" "FindingSeverity" NOT NULL DEFAULT 'LOW';

-- CreateIndex
CREATE INDEX "Finding_aiScore_idx" ON "Finding"("aiScore");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_assetId_key_key" ON "Finding"("assetId", "key");
