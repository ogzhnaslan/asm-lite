import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { forBreachExposureDetected } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { BreachExposureCheckResult } from '../checks/breach.check';

interface Asset {
  id: string;
  value: string;
}

export interface ProcessBreachFindingsParams {
  asset: Asset;
  scanRunId: string;
  current: BreachExposureCheckResult;
}

function computeSeverity(current: BreachExposureCheckResult): { severity: string; aiScore: number } {
  const types = current.sensitiveDataTypes;
  if (types.includes('password') || types.includes('plaintext_password')) return { severity: 'CRITICAL', aiScore: 95 };
  if (types.includes('password_hash')) return { severity: 'HIGH', aiScore: 85 };
  if (current.breachCount >= 5) return { severity: 'HIGH', aiScore: 85 };
  return { severity: 'MEDIUM', aiScore: 65 };
}

export async function processBreachFindings(
  prisma: PrismaClient,
  params: ProcessBreachFindingsParams,
): Promise<void> {
  const { asset, scanRunId, current } = params;
  const key = `BREACH_EXPOSURE_DETECTED:${asset.value}`;

  if (current.skipped || current.status !== 'ok') {
    log('breach skip finding processing', { domain: asset.value, skipped: current.skipped, status: current.status, error: current.error });
    return;
  }

  if (current.breachCount === 0) {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('breach no exposure resolved', { key });
    return;
  }

  const { severity, aiScore } = computeSeverity(current);
  const rec = forBreachExposureDetected(asset.value, current.breachCount, current.exposedEmailsCount, current.sensitiveDataTypes);

  await upsertFinding(prisma, {
    assetId: asset.id, scanRunId, key,
    type: FindingTypes.BREACH_EXPOSURE_DETECTED, severity, aiScore,
    dataJson: {
      domain: asset.value,
      provider: current.provider,
      breachCount: current.breachCount,
      exposedEmailsCount: current.exposedEmailsCount,
      latestBreachDate: current.latestBreachDate,
      sources: current.sources,
      sensitiveDataTypes: current.sensitiveDataTypes,
    },
    aiWhyJson: {
      ...rec,
      signals: {
        breachCount: current.breachCount,
        exposedEmailsCount: current.exposedEmailsCount,
        sensitiveDataTypes: current.sensitiveDataTypes,
        sources: current.sources.slice(0, 5),
      },
    },
  });

  log('breach exposure detected upserted', { key, severity, breachCount: current.breachCount, types: current.sensitiveDataTypes });
}
