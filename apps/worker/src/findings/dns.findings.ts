import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import {
  forDnsRecordChange, forDnsNsChange, forDnsMxChange, forDnsTxtChange,
  forSpfMissing, forDmarcMissing, forDmarcWeakPolicy, forCaaMissing,
} from '../utils/recommendations';
import { log } from '../utils/logger';
import type { DnsRecord, DnsRecordsCheckResult } from '../checks/dns-records.check';

interface Asset {
  id: string;
  value: string;
}

interface PrevSnap {
  dataJson: unknown;
}

export interface ProcessDnsFindingsParams {
  asset: Asset;
  scanRunId: string;
  dnsResult: DnsRecordsCheckResult;
  prevDnsSnap: PrevSnap | null;
}

// Returns sorted, deduplicated string values for the given record type
function valuesForType(records: DnsRecord[], type: string): string[] {
  return [...new Set(records.filter((r) => r.type === type).map((r) => r.value))].sort();
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function diff(prev: string[], curr: string[]): { added: string[]; removed: string[] } {
  const ps = new Set(prev);
  const cs = new Set(curr);
  return {
    added: curr.filter((v) => !ps.has(v)),
    removed: prev.filter((v) => !cs.has(v)),
  };
}

export async function processDnsFindings(prisma: PrismaClient, params: ProcessDnsFindingsParams): Promise<void> {
  if (params.dnsResult.error) {
    log('dns findings: check error, skipping', { asset: params.asset.value, error: params.dnsResult.error });
    return;
  }

  // Security config checks — run on every scan (no previous snapshot required)
  await Promise.all([
    _processSpf(prisma, params),
    _processDmarc(prisma, params),
    _processCaa(prisma, params),
  ]);

  // Change detection — requires a previous snapshot
  if (!params.prevDnsSnap?.dataJson) {
    log('dns findings: no previous snapshot, skipping change detection', { asset: params.asset.value });
    return;
  }

  const prevData = params.prevDnsSnap.dataJson as { records?: DnsRecord[]; error?: string };

  // If the previous snapshot contains an error (e.g., safeCheck fallback with CHECK_CRASHED),
  // skip all change detection — comparing against unreliable prev data produces false positives.
  // Do not resolve existing findings either; the data is not trustworthy.
  if (prevData.error) {
    log('dns findings: previous snapshot has error, skipping change detection to avoid false positives', {
      asset: params.asset.value,
      prevError: prevData.error,
    });
    return;
  }

  const prevRecords: DnsRecord[] = Array.isArray(prevData.records) ? prevData.records : [];

  await Promise.all([
    _processRecordChange(prisma, params, prevRecords),
    _processNsChange(prisma, params, prevRecords),
    _processMxChange(prisma, params, prevRecords),
    _processTxtChange(prisma, params, prevRecords),
  ]);
}

// ──────────────────────────────────────────────────────────────────
// Security configuration checks (no prev snapshot needed)
// ──────────────────────────────────────────────────────────────────

async function _processSpf(
  prisma: PrismaClient,
  { asset, scanRunId, dnsResult }: ProcessDnsFindingsParams,
): Promise<void> {
  const key = `DNS_SPF_MISSING:${asset.value}`;
  const hasSpf = dnsResult.records.some((r) => r.type === 'TXT' && r.value.startsWith('v=spf1'));

  if (!hasSpf) {
    const rec = forSpfMissing(asset.value);
    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.DNS_SPF_MISSING, severity: 'MEDIUM', aiScore: 60,
      dataJson: { domain: asset.value, txtRecords: dnsResult.records.filter((r) => r.type === 'TXT').map((r) => r.value) },
      aiWhyJson: { ...rec, signals: { spfFound: false } },
    });
    log('dns spf missing upserted', { key });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('dns spf missing resolved', { key });
  }
}

async function _processDmarc(
  prisma: PrismaClient,
  { asset, scanRunId, dnsResult }: ProcessDnsFindingsParams,
): Promise<void> {
  const missingKey = `DNS_DMARC_MISSING:${asset.value}`;
  const weakKey = `DNS_DMARC_WEAK_POLICY:${asset.value}`;
  const dmarcRecord = dnsResult.dmarcRecord;

  if (!dmarcRecord) {
    const rec = forDmarcMissing(asset.value);
    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key: missingKey,
      type: FindingTypes.DNS_DMARC_MISSING, severity: 'HIGH', aiScore: 75,
      dataJson: { domain: asset.value, dmarcSubdomain: `_dmarc.${asset.value}` },
      aiWhyJson: { ...rec, signals: { dmarcFound: false } },
    });
    log('dns dmarc missing upserted', { key: missingKey });
    // No DMARC at all → weak policy finding not relevant
    await resolveFinding(prisma, { assetId: asset.id, key: weakKey });
    return;
  }

  // DMARC exists — clear missing finding
  await resolveFinding(prisma, { assetId: asset.id, key: missingKey });
  log('dns dmarc missing resolved', { key: missingKey });

  // Check policy strength
  const policyMatch = /\bp=(\w+)/i.exec(dmarcRecord);
  const policy = (policyMatch?.[1] ?? 'none').toLowerCase();

  if (policy === 'none') {
    const rec = forDmarcWeakPolicy(asset.value, policy);
    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key: weakKey,
      type: FindingTypes.DNS_DMARC_WEAK_POLICY, severity: 'MEDIUM', aiScore: 65,
      dataJson: { domain: asset.value, dmarcRecord, policy },
      aiWhyJson: { ...rec, signals: { dmarcRecord, policy } },
    });
    log('dns dmarc weak policy upserted', { key: weakKey, policy });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key: weakKey });
    log('dns dmarc weak policy resolved', { key: weakKey, policy });
  }
}

async function _processCaa(
  prisma: PrismaClient,
  { asset, scanRunId, dnsResult }: ProcessDnsFindingsParams,
): Promise<void> {
  const key = `DNS_CAA_MISSING:${asset.value}`;
  const caaRecords = dnsResult.records.filter((r) => r.type === 'CAA');

  if (caaRecords.length === 0) {
    const rec = forCaaMissing(asset.value);
    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.DNS_CAA_MISSING, severity: 'LOW', aiScore: 35,
      dataJson: { domain: asset.value },
      aiWhyJson: { ...rec, signals: { caaFound: false } },
    });
    log('dns caa missing upserted', { key });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('dns caa missing resolved', { key });
  }
}

// ──────────────────────────────────────────────────────────────────
// Change detection (requires previous snapshot)
// ──────────────────────────────────────────────────────────────────

// DNS_RECORD_CHANGE — covers A, AAAA, CNAME, CAA, SOA
async function _processRecordChange(
  prisma: PrismaClient,
  { asset, scanRunId, dnsResult }: ProcessDnsFindingsParams,
  prevRecords: DnsRecord[],
): Promise<void> {
  const key = `DNS_RECORD_CHANGE:${asset.value}`;
  const changedTypes: string[] = [];
  const allAdded: string[] = [];
  const allRemoved: string[] = [];

  for (const type of ['A', 'AAAA', 'CNAME', 'CAA', 'SOA'] as const) {
    if (dnsResult.errors[type]) continue; // unreliable data for this type — skip
    const prev = valuesForType(prevRecords, type);
    const curr = valuesForType(dnsResult.records, type);
    if (!setsEqual(prev, curr)) {
      changedTypes.push(type);
      const d = diff(prev, curr);
      allAdded.push(...d.added.map((v) => `${type} ${v}`));
      allRemoved.push(...d.removed.map((v) => `${type} ${v}`));
    }
  }

  if (changedTypes.length > 0) {
    const hasIpChange = changedTypes.includes('A') || changedTypes.includes('AAAA');
    const severity = hasIpChange ? 'HIGH' : 'MEDIUM';
    const aiScore = hasIpChange ? 80 : 55;
    const rec = forDnsRecordChange(allAdded, allRemoved, changedTypes);

    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.DNS_RECORD_CHANGE, severity, aiScore,
      dataJson: { changedTypes, added: allAdded, removed: allRemoved },
      aiWhyJson: { ...rec, signals: { changedTypes, added: allAdded, removed: allRemoved } },
    });
    log('dns record change upserted', { key, severity, changedTypes });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('dns record change resolved', { key });
  }
}

// DNS_NS_CHANGE — nameserver change is a high-severity trust signal
async function _processNsChange(
  prisma: PrismaClient,
  { asset, scanRunId, dnsResult }: ProcessDnsFindingsParams,
  prevRecords: DnsRecord[],
): Promise<void> {
  const key = `DNS_NS_CHANGE:${asset.value}`;

  // Skip if NS query had an error — unreliable data, avoid false positives
  if (dnsResult.errors['NS']) {
    log('dns ns change: NS query error, skipping', { asset: asset.value, error: dnsResult.errors['NS'] });
    return;
  }

  const prevNs = valuesForType(prevRecords, 'NS');
  const currNs = valuesForType(dnsResult.records, 'NS');

  // Skip if current NS is empty but previous had records — likely DNS propagation or
  // resolver returning ENODATA; do not interpret missing results as NS deletion
  if (currNs.length === 0 && prevNs.length > 0) {
    log('dns ns change: current NS empty (prev had records), skipping to avoid false positive', { asset: asset.value, prevNs });
    return;
  }

  if (!setsEqual(prevNs, currNs)) {
    const rec = forDnsNsChange(prevNs, currNs);
    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.DNS_NS_CHANGE, severity: 'HIGH', aiScore: 80,
      dataJson: { previous: prevNs, current: currNs, ...diff(prevNs, currNs) },
      aiWhyJson: { ...rec, signals: { previous: prevNs, current: currNs } },
    });
    log('dns ns change upserted', { key, prevNs, currNs });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('dns ns change resolved', { key });
  }
}

// DNS_MX_CHANGE — mail routing change
async function _processMxChange(
  prisma: PrismaClient,
  { asset, scanRunId, dnsResult }: ProcessDnsFindingsParams,
  prevRecords: DnsRecord[],
): Promise<void> {
  const key = `DNS_MX_CHANGE:${asset.value}`;

  if (dnsResult.errors['MX']) {
    log('dns mx change: MX query error, skipping', { asset: asset.value, error: dnsResult.errors['MX'] });
    return;
  }

  const prevMx = valuesForType(prevRecords, 'MX');
  const currMx = valuesForType(dnsResult.records, 'MX');

  // Skip if current MX is empty but previous had records — likely DNS propagation or
  // resolver returning ENODATA; do not interpret missing results as MX deletion
  if (currMx.length === 0 && prevMx.length > 0) {
    log('dns mx change: current MX empty (prev had records), skipping to avoid false positive', { asset: asset.value, prevMx });
    return;
  }

  if (!setsEqual(prevMx, currMx)) {
    const rec = forDnsMxChange(prevMx, currMx);
    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.DNS_MX_CHANGE, severity: 'HIGH', aiScore: 80,
      dataJson: { previous: prevMx, current: currMx, ...diff(prevMx, currMx) },
      aiWhyJson: { ...rec, signals: { previous: prevMx, current: currMx } },
    });
    log('dns mx change upserted', { key, prevMx, currMx });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('dns mx change resolved', { key });
  }
}

// DNS_TXT_CHANGE — SPF, DMARC, verification token changes
async function _processTxtChange(
  prisma: PrismaClient,
  { asset, scanRunId, dnsResult }: ProcessDnsFindingsParams,
  prevRecords: DnsRecord[],
): Promise<void> {
  const key = `DNS_TXT_CHANGE:${asset.value}`;

  if (dnsResult.errors['TXT']) {
    log('dns txt change: TXT query error, skipping', { asset: asset.value, error: dnsResult.errors['TXT'] });
    return;
  }

  const prevTxt = valuesForType(prevRecords, 'TXT');
  const currTxt = valuesForType(dnsResult.records, 'TXT');

  // Skip if current TXT is empty but previous had records — likely DNS propagation or
  // resolver returning ENODATA; do not interpret missing results as TXT deletion
  if (currTxt.length === 0 && prevTxt.length > 0) {
    log('dns txt change: current TXT empty (prev had records), skipping to avoid false positive', { asset: asset.value, prevTxt });
    return;
  }

  if (!setsEqual(prevTxt, currTxt)) {
    const { added, removed } = diff(prevTxt, currTxt);
    const rec = forDnsTxtChange(added, removed);
    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.DNS_TXT_CHANGE, severity: 'MEDIUM', aiScore: 55,
      dataJson: { previous: prevTxt, current: currTxt, added, removed },
      aiWhyJson: { ...rec, signals: { added, removed } },
    });
    log('dns txt change upserted', { key, added: added.length, removed: removed.length });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('dns txt change resolved', { key });
  }
}
