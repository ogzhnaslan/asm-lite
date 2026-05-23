import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { forMaliciousReputationDetected } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { ReputationCheckResult } from '../checks/reputation.check';

interface Asset {
  id: string;
  value: string;
}

export interface ProcessReputationFindingsParams {
  asset: Asset;
  scanRunId: string;
  current: ReputationCheckResult;
}

export async function processReputationFindings(
  prisma: PrismaClient,
  params: ProcessReputationFindingsParams,
): Promise<void> {
  const { asset, scanRunId, current } = params;
  const key = `MALICIOUS_REPUTATION_DETECTED:${asset.value}`;

  if (current.skipped || current.error) {
    log('reputation skip finding processing', { asset: asset.value, skipped: current.skipped, error: current.error });
    return;
  }

  if (!current.isMalicious) {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('reputation not malicious resolved', { key });
    return;
  }

  const score = current.maxScore;
  let severity: string;
  let aiScore: number;
  if (score !== null && score >= 90) { severity = 'CRITICAL'; aiScore = 95; }
  else if (score !== null && score >= 70) { severity = 'HIGH'; aiScore = 85; }
  else if (score !== null && score >= 40) { severity = 'MEDIUM'; aiScore = 65; }
  else if (score !== null && score > 0) { severity = 'LOW'; aiScore = 35; }
  else { severity = 'HIGH'; aiScore = 85; } // isMalicious but no numeric score

  const providerNames = current.providers
    .filter((p) => p.status === 'ok' && p.isMalicious)
    .map((p) => p.name);

  const rec = forMaliciousReputationDetected(asset.value, current.assetType, providerNames, current.categories);

  await upsertFinding(prisma, {
    assetId: asset.id, scanRunId, key,
    type: FindingTypes.MALICIOUS_REPUTATION_DETECTED, severity, aiScore,
    dataJson: {
      assetValue: asset.value,
      assetType: current.assetType,
      isMalicious: current.isMalicious,
      maxScore: current.maxScore,
      categories: current.categories,
      providers: current.providers,
    },
    aiWhyJson: {
      ...rec,
      signals: { maxScore: current.maxScore, categories: current.categories, providers: providerNames },
    },
  });

  log('reputation malicious detected upserted', { key, severity, score: current.maxScore, categories: current.categories.slice(0, 5) });
}
