import type { PrismaClient } from '@prisma/client';
import { SQLI_PAYLOADS, type SqliPayload } from './sqli/payloads';
import {
  matchSqlError,
  detectStatusChanged,
  detectStatus5xx,
  detectBodyLengthDelta,
  computeRisk,
  type SqliSignal,
  type SqliRisk,
  type ErrorPatternMatch,
} from './sqli/detectors';
import { sqliFetch, buildSqliUrl, type SqliFetchResult } from './sqli/sqli-fetch';

// ─── Public types ────────────────────────────────────────────────────────────

export type SqliSkipReason = 'DISABLED' | 'NOT_DOMAIN' | 'NOT_VERIFIED' | 'NO_TARGETS';

export interface SqliCheckResult {
  enabled: boolean;
  skipped: boolean;
  skipReason?: SqliSkipReason;
  targetCount: number;
  testedParams: number;
  suspectedCount: number;
  results: SqliTargetResult[];
  checkedAt: string;
  error?: string;
}

export interface SqliTargetResult {
  targetId: string;
  url: string;
  method: 'GET';
  path: string;
  param: string;
  suspected: boolean;
  risk: SqliRisk | null;
  aiScore: number | null;
  confirmed: boolean;
  payloadId: string | null;
  payloadCategory: string | null;
  signals: SqliSignal[];
  evidence: {
    baselineStatus: number | null;
    baselineLength: number | null;
    payloadStatus: number | null;
    payloadLength: number | null;
    matchedErrorPattern: string | null;
    matchedErrorSnippet: string | null;
    networkError: string | null;
  };
  checkedAt: string;
}

// Minimal subset of Asset we need — keeps the function testable without
// requiring the full Prisma Asset shape.
export interface SqliAssetInput {
  id: string;
  type: string;
  value: string;
  status: string;
}

// ─── Limits & helpers ────────────────────────────────────────────────────────

const MAX_TARGETS_DEFENSIVE = 5;
const DEFAULT_REQUEST_DELAY_MS = 200;

function resolveDelayMs(): number {
  const raw = process.env.SQLI_REQUEST_DELAY_MS;
  if (raw === undefined || raw === '') return DEFAULT_REQUEST_DELAY_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_REQUEST_DELAY_MS;
  return parsed;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function now(): string {
  return new Date().toISOString();
}

function makeSkipped(reason: SqliSkipReason, enabled: boolean): SqliCheckResult {
  return {
    enabled,
    skipped: true,
    skipReason: reason,
    targetCount: 0,
    testedParams: 0,
    suspectedCount: 0,
    results: [],
    checkedAt: now(),
  };
}

// ─── Per-target probe ────────────────────────────────────────────────────────

interface SqliTargetRow {
  id: string;
  path: string;
  paramsJson: unknown;
  injectParam: string;
}

interface ProbeRecord {
  payload: SqliPayload;
  probe: SqliFetchResult;
  signals: Set<SqliSignal>;
  errorMatch: ErrorPatternMatch | null;
}

function parseParams(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function makeCleanResult(
  target: SqliTargetRow,
  baselineUrl: string,
  baseline: SqliFetchResult,
): SqliTargetResult {
  return {
    targetId: target.id,
    url: baselineUrl,
    method: 'GET',
    path: target.path,
    param: target.injectParam,
    suspected: false,
    risk: null,
    aiScore: null,
    confirmed: false,
    payloadId: null,
    payloadCategory: null,
    signals: [],
    evidence: {
      baselineStatus: baseline.status,
      baselineLength: baseline.length,
      payloadStatus: null,
      payloadLength: null,
      matchedErrorPattern: null,
      matchedErrorSnippet: null,
      networkError: null,
    },
    checkedAt: now(),
  };
}

function makeNetworkErrorResult(
  target: SqliTargetRow,
  baselineUrl: string,
  networkError: string,
): SqliTargetResult {
  return {
    targetId: target.id,
    url: baselineUrl,
    method: 'GET',
    path: target.path,
    param: target.injectParam,
    suspected: false,
    risk: null,
    aiScore: null,
    confirmed: false,
    payloadId: null,
    payloadCategory: null,
    signals: [],
    evidence: {
      baselineStatus: null,
      baselineLength: null,
      payloadStatus: null,
      payloadLength: null,
      matchedErrorPattern: null,
      matchedErrorSnippet: null,
      networkError,
    },
    checkedAt: now(),
  };
}

async function runTargetProbe(domain: string, target: SqliTargetRow, delayMs: number): Promise<SqliTargetResult> {
  const params = parseParams(target.paramsJson);
  const baselineUrl = buildSqliUrl(domain, target.path, params);

  const baseline = await sqliFetch(baselineUrl);
  if (baseline.networkError !== null) {
    return makeNetworkErrorResult(target, baselineUrl, baseline.networkError);
  }

  const probeRecords: ProbeRecord[] = [];
  const aggregatedSignals = new Set<SqliSignal>();

  for (const payload of SQLI_PAYLOADS) {
    await sleep(delayMs);
    const probeParams = { ...params, [target.injectParam]: payload.value };
    const probeUrl = buildSqliUrl(domain, target.path, probeParams);
    const probe = await sqliFetch(probeUrl);

    const signals = new Set<SqliSignal>();
    let errorMatch: ErrorPatternMatch | null = null;

    if (probe.networkError === null) {
      errorMatch = matchSqlError(probe.body);
      if (errorMatch) signals.add('SQL_ERROR_PATTERN');
      if (detectStatusChanged(baseline.status, probe.status)) signals.add('STATUS_CODE_CHANGED');
      if (detectStatus5xx(probe.status)) signals.add('STATUS_CODE_5XX');
      if (detectBodyLengthDelta(baseline.length, probe.length)) signals.add('BODY_LENGTH_DELTA');
    }
    // Network error on a probe is NOT a SQLi signal — silently skip it.

    probeRecords.push({ payload, probe, signals, errorMatch });
    signals.forEach((s) => aggregatedSignals.add(s));
  }

  // Boolean TRUE/FALSE response delta (cross-payload comparison)
  const truthy = probeRecords.find((r) => r.payload.category === 'boolean_true');
  const falsy  = probeRecords.find((r) => r.payload.category === 'boolean_false');
  if (
    truthy && falsy &&
    truthy.probe.networkError === null && falsy.probe.networkError === null &&
    detectBodyLengthDelta(truthy.probe.length, falsy.probe.length)
  ) {
    aggregatedSignals.add('BOOLEAN_TRUE_FALSE_DELTA');
  }

  if (aggregatedSignals.size === 0) {
    return makeCleanResult(target, baselineUrl, baseline);
  }

  // Pick the strongest probe — SQL_ERROR_PATTERN takes priority, otherwise
  // any payload that produced a signal, falling back to the first record.
  const strongest =
    probeRecords.find((r) => r.signals.has('SQL_ERROR_PATTERN'))
    ?? probeRecords.find((r) => r.signals.size > 0)
    ?? probeRecords[0]!;

  // Confirmation: re-issue the strongest payload once; only count as confirmed
  // when the SQL_ERROR_PATTERN signal reappears. Body/status fluctuations are
  // not enough — we want a deterministic engine signature.
  let confirmed = false;
  if (strongest.signals.has('SQL_ERROR_PATTERN')) {
    await sleep(delayMs);
    const retryUrl = buildSqliUrl(domain, target.path, { ...params, [target.injectParam]: strongest.payload.value });
    const retry = await sqliFetch(retryUrl);
    if (retry.networkError === null && matchSqlError(retry.body) !== null) {
      confirmed = true;
    }
  }

  const { risk, aiScore } = computeRisk({ signals: aggregatedSignals, confirmed });

  // Pull the first error-pattern match across all records so evidence carries
  // engine info even when the "strongest" record is, say, a 5xx without body.
  const evidenceErrorMatch =
    strongest.errorMatch ?? probeRecords.find((r) => r.errorMatch)?.errorMatch ?? null;

  return {
    targetId: target.id,
    url: buildSqliUrl(domain, target.path, { ...params, [target.injectParam]: strongest.payload.value }),
    method: 'GET',
    path: target.path,
    param: target.injectParam,
    suspected: true,
    risk,
    aiScore,
    confirmed,
    payloadId: strongest.payload.id,
    payloadCategory: strongest.payload.category,
    signals: Array.from(aggregatedSignals),
    evidence: {
      baselineStatus: baseline.status,
      baselineLength: baseline.length,
      payloadStatus: strongest.probe.status,
      payloadLength: strongest.probe.length,
      matchedErrorPattern: evidenceErrorMatch?.engine ?? null,
      matchedErrorSnippet: evidenceErrorMatch?.snippet ?? null,
      networkError: null,
    },
    checkedAt: now(),
  };
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export async function checkSqli(prisma: PrismaClient, asset: SqliAssetInput): Promise<SqliCheckResult> {
  if (process.env.ENABLE_SQLI_CHECK !== 'true') {
    return makeSkipped('DISABLED', false);
  }
  if (asset.type !== 'DOMAIN') {
    return makeSkipped('NOT_DOMAIN', true);
  }
  if (asset.status !== 'VERIFIED') {
    return makeSkipped('NOT_VERIFIED', true);
  }

  let targets: SqliTargetRow[];
  try {
    targets = await prisma.sqliTarget.findMany({
      where: { assetId: asset.id, enabled: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_TARGETS_DEFENSIVE,
      select: { id: true, path: true, paramsJson: true, injectParam: true },
    }) as unknown as SqliTargetRow[];
  } catch (err) {
    return {
      enabled: true,
      skipped: false,
      targetCount: 0,
      testedParams: 0,
      suspectedCount: 0,
      results: [],
      checkedAt: now(),
      error: (err as Error).message ?? 'DB_ERROR',
    };
  }

  if (targets.length === 0) {
    return makeSkipped('NO_TARGETS', true);
  }

  const delayMs = resolveDelayMs();
  const results: SqliTargetResult[] = [];
  for (const target of targets) {
    try {
      const result = await runTargetProbe(asset.value, target, delayMs);
      results.push(result);
    } catch (err) {
      // Per-target isolation: a single target failure must not kill the whole
      // check. Surface as networkError so downstream consumers can see what happened.
      results.push(makeNetworkErrorResult(
        target,
        `https://${asset.value}${target.path}`,
        (err as Error).message ?? 'PROBE_FAILED',
      ));
    }
    await sleep(delayMs);
  }

  return {
    enabled: true,
    skipped: false,
    targetCount: targets.length,
    testedParams: targets.length,
    suspectedCount: results.filter((r) => r.suspected).length,
    results,
    checkedAt: now(),
  };
}
