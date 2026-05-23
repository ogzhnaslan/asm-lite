import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { forRobotsSensitivePath, forRobotsChange } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { RobotsCheckResult } from '../checks/robots.check';

interface Asset {
  id: string;
  value: string;
}

export interface ProcessRobotsFindingsParams {
  asset: Asset;
  scanRunId: string;
  current: RobotsCheckResult;
  previous: unknown;
}

export async function processRobotsFindings(prisma: PrismaClient, params: ProcessRobotsFindingsParams): Promise<void> {
  await Promise.all([
    _processSensitivePaths(prisma, params),
    _processChange(prisma, params),
  ]);
}

async function _processSensitivePaths(
  prisma: PrismaClient,
  { asset, scanRunId, current }: ProcessRobotsFindingsParams,
): Promise<void> {
  const key = `ROBOTS_SENSITIVE_PATH_EXPOSED:${asset.value}`;

  if (current.error) {
    log('robots sensitive path: check error, skipping', { key, error: current.error });
    return;
  }

  if (!current.exists || current.sensitivePaths.length === 0) {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('robots sensitive path resolved', { key });
    return;
  }

  const isHigh = current.highSeverityPaths.length > 0;
  const severity = isHigh ? 'HIGH' : 'MEDIUM';
  const aiScore = isHigh ? 75 : 55;
  const rec = forRobotsSensitivePath(asset.value, current.sensitivePaths, current.highSeverityPaths);

  await upsertFinding(prisma, {
    assetId: asset.id, scanRunId, key,
    type: FindingTypes.ROBOTS_SENSITIVE_PATH_EXPOSED, severity, aiScore,
    dataJson: {
      domain: asset.value, url: current.url,
      sensitivePaths: current.sensitivePaths,
      highSeverityPaths: current.highSeverityPaths,
      totalDisallowRules: current.disallowRules.length,
    },
    aiWhyJson: { ...rec, signals: { sensitivePaths: current.sensitivePaths, highSeverityPaths: current.highSeverityPaths } },
  });
  log('robots sensitive path upserted', { key, severity, count: current.sensitivePaths.length });
}

async function _processChange(
  prisma: PrismaClient,
  { asset, scanRunId, current, previous }: ProcessRobotsFindingsParams,
): Promise<void> {
  const key = `ROBOTS_CHANGE:${asset.value}`;

  if (!previous) return;

  if (current.error) {
    log('robots change: check error, skipping', { key, error: current.error });
    return;
  }

  if (!current.exists) {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('robots change resolved (no robots.txt)', { key });
    return;
  }

  const prev = previous as Partial<RobotsCheckResult>;
  const prevHash = prev.contentHash ?? null;
  const currHash = current.contentHash;

  if (prevHash === currHash) {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('robots change resolved', { key });
    return;
  }

  // Compute added/removed disallow rules for context
  const prevDisallow = new Set(prev.disallowRules ?? []);
  const currDisallow = new Set(current.disallowRules);
  const addedRules = current.disallowRules.filter((r) => !prevDisallow.has(r));
  const removedRules = (prev.disallowRules ?? []).filter((r) => !currDisallow.has(r));

  const rec = forRobotsChange(asset.value, addedRules, removedRules);
  await upsertFinding(prisma, {
    assetId: asset.id, scanRunId, key,
    type: FindingTypes.ROBOTS_CHANGE, severity: 'LOW', aiScore: 30,
    dataJson: {
      domain: asset.value, previousHash: prevHash, currentHash: currHash,
      addedDisallowRules: addedRules, removedDisallowRules: removedRules,
    },
    aiWhyJson: { ...rec, signals: { previousHash: prevHash, currentHash: currHash, addedRules, removedRules } },
  });
  log('robots change upserted', { key, added: addedRules.length, removed: removedRules.length });
}
