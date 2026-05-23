import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { forOtxPulseDetected, forOtxMalwareActivityDetected } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { OtxCheckResult } from '../checks/otx.check';

interface Asset {
  id: string;
  value: string;
}

export interface ProcessOtxFindingsParams {
  asset: Asset;
  scanRunId: string;
  current: OtxCheckResult;
}

export async function processOtxFindings(
  prisma: PrismaClient,
  params: ProcessOtxFindingsParams,
): Promise<void> {
  const { asset, scanRunId, current } = params;

  if (current.skipped || current.error) {
    log('otx skip finding processing', { asset: asset.value, skipped: current.skipped, error: current.error });
    return;
  }

  const malwareKey = `OTX_MALWARE_ACTIVITY_DETECTED:${asset.value}`;
  const pulseKey = `OTX_PULSE_DETECTED:${asset.value}`;

  const isClean = current.pulseCount === 0 && current.malwareCount === 0;

  if (isClean) {
    await resolveFinding(prisma, { assetId: asset.id, key: malwareKey });
    await resolveFinding(prisma, { assetId: asset.id, key: pulseKey });
    log('otx clean resolved', { asset: asset.value });
    return;
  }

  if (current.malwareCount > 0) {
    const severity = current.malwareCount >= 50 ? 'HIGH' : 'MEDIUM';
    const aiScore = current.malwareCount >= 50 ? 80 : 65;
    const rec = forOtxMalwareActivityDetected(asset.value, current.malwareCount, current.tags);

    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key: malwareKey,
      type: FindingTypes.OTX_MALWARE_ACTIVITY_DETECTED, severity, aiScore,
      dataJson: {
        assetValue: current.assetValue,
        assetType: current.assetType,
        provider: current.provider,
        malwareCount: current.malwareCount,
        pulseCount: current.pulseCount,
        tags: current.tags.slice(0, 10),
      },
      aiWhyJson: { ...rec },
    });

    log('otx malware detected upserted', { key: malwareKey, severity, malwareCount: current.malwareCount });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key: malwareKey });
  }

  if (current.pulseCount > 0) {
    const severity = current.pulseCount >= 10 ? 'MEDIUM' : 'LOW';
    const aiScore = current.pulseCount >= 10 ? 60 : 45;
    const rec = forOtxPulseDetected(asset.value, current.pulseCount, current.pulses.slice(0, 5).map((p) => p.name), current.tags);

    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key: pulseKey,
      type: FindingTypes.OTX_PULSE_DETECTED, severity, aiScore,
      dataJson: {
        assetValue: current.assetValue,
        assetType: current.assetType,
        provider: current.provider,
        pulseCount: current.pulseCount,
        pulses: current.pulses.slice(0, 5),
        tags: current.tags.slice(0, 10),
        urlListCount: current.urlListCount,
        passiveDnsCount: current.passiveDnsCount,
      },
      aiWhyJson: { ...rec },
    });

    log('otx pulse detected upserted', { key: pulseKey, severity, pulseCount: current.pulseCount });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key: pulseKey });
  }
}
