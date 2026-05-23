import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { forWhoisExpiring, forWhoisChange } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { RdapCheckResult } from '../checks/rdap.check';

interface Asset {
  id: string;
  value: string;
}

export interface ProcessWhoisFindingsParams {
  asset: Asset;
  scanRunId: string;
  current: RdapCheckResult;
  previous: unknown;
}

const EXPIRY_CRITICAL_DAYS = 7;
const EXPIRY_HIGH_DAYS = 15;
const EXPIRY_WARN_DAYS = 30;

export async function processWhoisFindings(prisma: PrismaClient, params: ProcessWhoisFindingsParams): Promise<void> {
  // Skip all finding logic if RDAP failed — no reliable data to act on
  if (params.current.error) {
    log('whois findings: RDAP error, skipping', { domain: params.asset.value, error: params.current.error });
    return;
  }

  await Promise.all([
    _processExpiry(prisma, params),
    _processChange(prisma, params),
  ]);
}

async function _processExpiry(
  prisma: PrismaClient,
  { asset, scanRunId, current }: ProcessWhoisFindingsParams,
): Promise<void> {
  const key = `WHOIS_EXPIRING:${asset.value}`;

  if (!current.expiresDate) {
    log('whois expiry: no expiresDate, skipping', { domain: asset.value });
    return;
  }

  const daysLeft = Math.floor((new Date(current.expiresDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (daysLeft <= EXPIRY_WARN_DAYS) {
    const severity =
      daysLeft <= EXPIRY_CRITICAL_DAYS ? 'CRITICAL' :
      daysLeft <= EXPIRY_HIGH_DAYS ? 'HIGH' : 'MEDIUM';
    const aiScore =
      daysLeft <= EXPIRY_CRITICAL_DAYS ? 95 :
      daysLeft <= EXPIRY_HIGH_DAYS ? 80 : 60;
    const rec = forWhoisExpiring(asset.value, daysLeft, current.expiresDate);

    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.WHOIS_EXPIRING, severity, aiScore,
      dataJson: { domain: asset.value, expiresDate: current.expiresDate, daysLeft },
      aiWhyJson: { ...rec, signals: { expiresDate: current.expiresDate, daysLeft } },
    });
    log('whois expiring upserted', { key, severity, daysLeft });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('whois expiring resolved', { key, daysLeft });
  }
}

async function _processChange(
  prisma: PrismaClient,
  { asset, scanRunId, current, previous }: ProcessWhoisFindingsParams,
): Promise<void> {
  if (!previous) return;

  const key = `WHOIS_CHANGE:${asset.value}`;
  const prev = previous as Partial<RdapCheckResult>;

  type FieldSeverity = { severity: 'HIGH' | 'MEDIUM' | 'LOW'; aiScore: number };
  const FIELD_WEIGHTS: Record<string, FieldSeverity> = {
    registrar:   { severity: 'HIGH',   aiScore: 80 },
    nameServers: { severity: 'HIGH',   aiScore: 75 },
    status:      { severity: 'MEDIUM', aiScore: 55 },
    expiresDate: { severity: 'LOW',    aiScore: 30 },
  };

  const changedFields: string[] = [];
  const changes: Record<string, unknown> = {};

  // registrar
  if ((prev.registrar ?? null) !== (current.registrar ?? null)) {
    changedFields.push('registrar');
    changes.registrar = { previous: prev.registrar ?? null, current: current.registrar };
  }

  // nameServers (sorted array comparison)
  const prevNs = (prev.nameServers ?? []).slice().sort();
  const currNs = current.nameServers.slice().sort();
  if (JSON.stringify(prevNs) !== JSON.stringify(currNs)) {
    changedFields.push('nameServers');
    const ps = new Set(prevNs);
    const cs = new Set(currNs);
    changes.nameServers = {
      previous: prevNs,
      current: currNs,
      added: currNs.filter((v) => !ps.has(v)),
      removed: prevNs.filter((v) => !cs.has(v)),
    };
  }

  // status
  const prevStatus = (prev.status ?? []).slice().sort();
  const currStatus = current.status.slice().sort();
  if (JSON.stringify(prevStatus) !== JSON.stringify(currStatus)) {
    changedFields.push('status');
    changes.status = { previous: prevStatus, current: currStatus };
  }

  // expiresDate
  if ((prev.expiresDate ?? null) !== (current.expiresDate ?? null)) {
    changedFields.push('expiresDate');
    changes.expiresDate = { previous: prev.expiresDate ?? null, current: current.expiresDate };
  }

  if (changedFields.length === 0) {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('whois change resolved', { key });
    return;
  }

  // Pick highest severity among changed fields
  const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  let severity: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  let aiScore = 30;
  for (const field of changedFields) {
    const w = FIELD_WEIGHTS[field];
    if (w && severityRank[w.severity] > severityRank[severity]) {
      severity = w.severity;
      aiScore = w.aiScore;
    }
  }

  const rec = forWhoisChange(asset.value, changedFields);
  await upsertFinding(prisma, {
    assetId: asset.id, scanRunId, key,
    type: FindingTypes.WHOIS_CHANGE, severity, aiScore,
    dataJson: { domain: asset.value, changedFields, changes },
    aiWhyJson: { ...rec, signals: { changedFields, changes } },
  });
  log('whois change upserted', { key, severity, changedFields });
}
