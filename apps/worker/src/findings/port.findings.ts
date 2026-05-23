import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { RISKY_PORTS, CRITICAL_PORTS } from '../config/constants';
import { forPortExposed, forPortChange } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { PortsCheckResult } from '../checks/ports.check';

interface Asset {
  id: string;
  value: string;
}

interface PrevSnap {
  dataJson: unknown;
}

interface ProcessPortFindingsParams {
  asset: Asset;
  scanRunId: string;
  portsResult: PortsCheckResult;
  prevPortsSnap: PrevSnap | null;
}

export async function processPortFindings(prisma: PrismaClient, params: ProcessPortFindingsParams): Promise<void> {
  if (params.portsResult.error) {
    log('port findings: check error, skipping', { asset: params.asset.value, error: params.portsResult.error });
    return;
  }
  await _processExposed(prisma, params);
  await _processChange(prisma, params);
}

async function _processExposed(
  prisma: PrismaClient,
  { asset, scanRunId, portsResult }: ProcessPortFindingsParams,
): Promise<void> {
  const riskyPorts = portsResult.openPorts.filter((p) => (RISKY_PORTS as readonly number[]).includes(p));
  const key = `PORT_EXPOSED:${asset.value}`;

  if (riskyPorts.length > 0) {
    const severity = riskyPorts.some((p) => (CRITICAL_PORTS as readonly number[]).includes(p)) ? 'CRITICAL' : 'HIGH';
    const aiScore = severity === 'CRITICAL' ? 95 : 85;
    const rec = forPortExposed(riskyPorts);

    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.PORT_EXPOSED, severity, aiScore,
      dataJson: { openPorts: portsResult.openPorts, riskyPorts, results: portsResult.results as unknown as Record<string, unknown>[] } as unknown as Record<string, unknown>,
      aiWhyJson: { ...rec, signals: { openPorts: portsResult.openPorts, riskyPorts } },
    });
    log('port exposed upserted', { key, severity, riskyPorts });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('port exposed resolved', { key });
  }
}

async function _processChange(
  prisma: PrismaClient,
  { asset, scanRunId, portsResult, prevPortsSnap }: ProcessPortFindingsParams,
): Promise<void> {
  if (!prevPortsSnap?.dataJson) return;

  const prev = prevPortsSnap.dataJson as { openPorts?: number[] };
  const prevOpenPorts = Array.isArray(prev.openPorts) ? prev.openPorts : [];
  const currOpenPorts = portsResult.openPorts;

  const newlyOpened = currOpenPorts.filter((p) => !prevOpenPorts.includes(p));
  const newlyClosed = prevOpenPorts.filter((p) => !currOpenPorts.includes(p));

  if (newlyOpened.length === 0 && newlyClosed.length === 0) return;

  const key = `PORT_CHANGE:${asset.value}`;
  const severity =
    newlyOpened.some((p) => (CRITICAL_PORTS as readonly number[]).includes(p)) ? 'CRITICAL' :
    newlyOpened.some((p) => (RISKY_PORTS as readonly number[]).includes(p)) ? 'HIGH' : 'MEDIUM';
  const aiScore = severity === 'CRITICAL' ? 95 : severity === 'HIGH' ? 85 : 70;
  const rec = forPortChange(newlyOpened, newlyClosed);

  await upsertFinding(prisma, {
    assetId: asset.id, scanRunId, key,
    type: FindingTypes.PORT_CHANGE, severity, aiScore,
    dataJson: { prevOpenPorts, currOpenPorts, newlyOpened, newlyClosed },
    aiWhyJson: { ...rec, signals: { prevOpenPorts, currOpenPorts, newlyOpened, newlyClosed } },
  });
  log('port change upserted', { key, severity, newlyOpened, newlyClosed });
}
