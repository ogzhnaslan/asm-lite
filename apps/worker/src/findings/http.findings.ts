import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { HTTP_LATENCY_SPIKE_MS } from '../config/constants';
import { forHttpHealth, forHttpChange } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { HttpCheckResult } from '../checks/http.check';

interface Asset {
  id: string;
  value: string;
}

interface PrevSnap {
  dataJson: unknown;
}

interface ProcessHttpFindingsParams {
  asset: Asset;
  scanRunId: string;
  health: HttpCheckResult;
  prevHttpSnap: PrevSnap | null;
}

export async function processHttpFindings(prisma: PrismaClient, params: ProcessHttpFindingsParams): Promise<void> {
  if (params.health.error === 'CHECK_CRASHED') {
    log('http findings: check crashed, skipping', { asset: params.asset.value });
    return;
  }
  await _processHealth(prisma, params);
  await _processChange(prisma, params);
}

async function _processHealth(
  prisma: PrismaClient,
  { asset, scanRunId, health }: ProcessHttpFindingsParams,
): Promise<void> {
  const key = `HTTP_HEALTH:${asset.value}`;
  const isUnhealthy = health.statusCode === null || health.statusCode >= 500;
  const isHealthy = typeof health.statusCode === 'number' && health.statusCode < 500;

  if (isUnhealthy) {
    const severity = health.statusCode === null ? 'CRITICAL' : 'HIGH';
    const aiScore = health.statusCode === null ? 95 : 85;
    const rec = forHttpHealth(health.statusCode);

    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.HTTP_HEALTH, severity, aiScore,
      dataJson: health as unknown as Record<string, unknown>,
      aiWhyJson: { ...rec, signals: health },
    });
    log('http health upserted', { key, severity, statusCode: health.statusCode });
  } else if (isHealthy) {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('http health resolved', { key });
  }
}

async function _processChange(
  prisma: PrismaClient,
  { asset, scanRunId, health, prevHttpSnap }: ProcessHttpFindingsParams,
): Promise<void> {
  if (!prevHttpSnap?.dataJson) return;

  const prev = prevHttpSnap.dataJson as { statusCode?: number | null; latencyMs?: number | null };
  const prevStatus = prev.statusCode ?? null;
  const currStatus = health.statusCode;
  const prevLatency = prev.latencyMs ?? null;
  const currLatency = health.latencyMs;

  const statusChanged = prevStatus !== currStatus;
  const latencySpike =
    typeof prevLatency === 'number' &&
    typeof currLatency === 'number' &&
    currLatency - prevLatency >= HTTP_LATENCY_SPIKE_MS;

  if (!statusChanged && !latencySpike) return;

  const key = `HTTP_CHANGE:${asset.value}`;
  const severity =
    currStatus === null ? 'CRITICAL' :
    currStatus >= 500 ? 'HIGH' :
    latencySpike ? 'MEDIUM' : 'LOW';
  const aiScore = severity === 'CRITICAL' ? 95 : severity === 'HIGH' ? 85 : severity === 'MEDIUM' ? 70 : 30;
  const rec = forHttpChange(prevStatus, currStatus, latencySpike, prevLatency, currLatency);

  await upsertFinding(prisma, {
    assetId: asset.id, scanRunId, key,
    type: FindingTypes.HTTP_CHANGE, severity, aiScore,
    dataJson: { prevStatus, currStatus, prevLatency, currLatency, statusChanged, latencySpike },
    aiWhyJson: { ...rec, signals: { prev, curr: health } },
  });
  log('http change upserted', { key, severity });
}
