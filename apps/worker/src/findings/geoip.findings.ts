import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { forAsnChange, forGeoIpChange } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { GeoIpCheckResult } from '../checks/geoip.check';

interface Asset {
  id: string;
  value: string;
}

export interface ProcessGeoIpFindingsParams {
  asset: Asset;
  scanRunId: string;
  current: GeoIpCheckResult;
  previous: unknown;
}

export async function processGeoIpFindings(prisma: PrismaClient, params: ProcessGeoIpFindingsParams): Promise<void> {
  if (params.current.error) {
    log('geoip findings: lookup error, skipping', { asset: params.asset.value, error: params.current.error });
    return;
  }

  if (!params.previous) {
    log('geoip findings: no previous snapshot, skipping change detection', { asset: params.asset.value });
    return;
  }

  const prev = params.previous as Partial<GeoIpCheckResult>;

  await Promise.all([
    _processAsnChange(prisma, params, prev),
    _processGeoIpChange(prisma, params, prev),
  ]);
}

async function _processAsnChange(
  prisma: PrismaClient,
  { asset, scanRunId, current }: ProcessGeoIpFindingsParams,
  prev: Partial<GeoIpCheckResult>,
): Promise<void> {
  const key = `ASN_CHANGE:${asset.value}`;
  const prevAsn = prev.asn ?? null;
  const currAsn = current.asn;

  if (prevAsn !== currAsn) {
    const rec = forAsnChange(asset.value, prevAsn, currAsn, prev.organization ?? null, current.organization);
    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.ASN_CHANGE, severity: 'HIGH', aiScore: 80,
      dataJson: {
        assetValue: asset.value,
        resolvedIp: { previous: prev.resolvedIp ?? null, current: current.resolvedIp },
        asn: { previous: prevAsn, current: currAsn },
        organization: { previous: prev.organization ?? null, current: current.organization },
      },
      aiWhyJson: { ...rec, signals: { previousAsn: prevAsn, currentAsn: currAsn } },
    });
    log('asn change upserted', { key, prevAsn, currAsn });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('asn change resolved', { key });
  }
}

async function _processGeoIpChange(
  prisma: PrismaClient,
  { asset, scanRunId, current }: ProcessGeoIpFindingsParams,
  prev: Partial<GeoIpCheckResult>,
): Promise<void> {
  const key = `GEOIP_CHANGE:${asset.value}`;

  type FieldWeight = { severity: 'HIGH' | 'MEDIUM' | 'LOW'; aiScore: number };
  const WEIGHTS: Record<string, FieldWeight> = {
    countryCode:  { severity: 'MEDIUM', aiScore: 60 },
    country:      { severity: 'MEDIUM', aiScore: 60 },
    isp:          { severity: 'MEDIUM', aiScore: 55 },
    organization: { severity: 'MEDIUM', aiScore: 55 },
    region:       { severity: 'LOW',    aiScore: 35 },
    city:         { severity: 'LOW',    aiScore: 30 },
  };

  const changedFields: string[] = [];
  const changes: Record<string, { previous: unknown; current: unknown }> = {};

  for (const field of Object.keys(WEIGHTS) as (keyof GeoIpCheckResult)[]) {
    const p = (prev[field] ?? null) as string | null;
    const c = (current[field] ?? null) as string | null;
    if (p !== c) {
      changedFields.push(field as string);
      changes[field as string] = { previous: p, current: c };
    }
  }

  if (changedFields.length === 0) {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('geoip change resolved', { key });
    return;
  }

  // Escalate to HIGH if both country and org/isp changed
  const hasCountry = changedFields.includes('countryCode') || changedFields.includes('country');
  const hasOrg = changedFields.includes('isp') || changedFields.includes('organization');
  let severity: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  let aiScore = 30;

  if (hasCountry && hasOrg) {
    severity = 'HIGH';
    aiScore = 75;
  } else {
    const ranks = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    for (const field of changedFields) {
      const w = WEIGHTS[field];
      if (w && ranks[w.severity] > ranks[severity]) {
        severity = w.severity;
        aiScore = w.aiScore;
      }
    }
  }

  const rec = forGeoIpChange(asset.value, changedFields);
  await upsertFinding(prisma, {
    assetId: asset.id, scanRunId, key,
    type: FindingTypes.GEOIP_CHANGE, severity, aiScore,
    dataJson: { assetValue: asset.value, changedFields, changes },
    aiWhyJson: { ...rec, signals: { changedFields, changes } },
  });
  log('geoip change upserted', { key, severity, changedFields });
}
