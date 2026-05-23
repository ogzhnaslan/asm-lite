import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { forPhishingDetected } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { PhishTankCheckResult } from '../checks/phishtank.check';

interface Asset {
  id: string;
  value: string;
}

export interface ProcessPhishTankFindingsParams {
  asset: Asset;
  scanRunId: string;
  current: PhishTankCheckResult;
}

export async function processPhishTankFindings(
  prisma: PrismaClient,
  params: ProcessPhishTankFindingsParams,
): Promise<void> {
  const { asset, scanRunId, current } = params;
  const key = `PHISHING_DETECTED:${asset.value}`;

  if (current.skipped || current.error) {
    log('phishtank skip finding processing', { domain: asset.value, skipped: current.skipped, error: current.error });
    return;
  }

  if (!current.isListed) {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('phishtank no phishing resolved', { key });
    return;
  }

  const verifiedAndOnline = current.verifiedMatches > 0 && current.onlineMatches > 0;
  const verifiedOnly = current.verifiedMatches > 0 && current.onlineMatches === 0;

  const severity = verifiedAndOnline ? 'CRITICAL' : verifiedOnly ? 'HIGH' : 'MEDIUM';
  const aiScore = verifiedAndOnline ? 95 : verifiedOnly ? 85 : 65;

  const matchedUrlStrings = current.matchedUrls.map((m) => m.url);
  const rec = forPhishingDetected(asset.value, matchedUrlStrings);

  await upsertFinding(prisma, {
    assetId: asset.id, scanRunId, key,
    type: FindingTypes.PHISHING_DETECTED, severity, aiScore,
    dataJson: {
      domain: asset.value,
      provider: current.provider,
      verifiedMatches: current.verifiedMatches,
      onlineMatches: current.onlineMatches,
      matchedUrls: current.matchedUrls,
    },
    aiWhyJson: { ...rec, signals: { verifiedMatches: current.verifiedMatches, onlineMatches: current.onlineMatches } },
  });

  log('phishtank phishing detected upserted', { key, severity, verified: current.verifiedMatches, online: current.onlineMatches });
}
