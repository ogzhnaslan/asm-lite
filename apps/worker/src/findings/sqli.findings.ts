import type { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { forSqliSuspected } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { SqliCheckResult, SqliTargetResult } from '../checks/sqli.check';

interface Asset {
  id: string;
  value: string;
}

interface ProcessSqliFindingsParams {
  asset: Asset;
  scanRunId: string;
  sqliResult: SqliCheckResult;
}

const AI_SCORE_FALLBACK: Record<string, number> = {
  LOW: 35,
  MEDIUM: 65,
  HIGH: 85,
  CRITICAL: 95,
};

export function buildSqliFindingKey(assetValue: string, path: string, param: string): string {
  return `SQLI:${assetValue}:${path}:${param}`;
}

export async function processSqliFindings(
  prisma: PrismaClient,
  params: ProcessSqliFindingsParams,
): Promise<void> {
  const { asset, scanRunId, sqliResult } = params;

  // Global guard: top-level check error (CHECK_CRASHED, DB_ERROR vb.) — finding
  // üretme veya resolve etme. Eski findings olduğu gibi kalır.
  if (sqliResult.error) {
    log('sqli findings: check error, skipping', { asset: asset.value, error: sqliResult.error });
    return;
  }

  // Skipped (DISABLED/NOT_DOMAIN/NOT_VERIFIED/NO_TARGETS): hiçbir DB çağrısı yok.
  // Açık findings olduğu yerde kalır — kapanış için aktif scan gerekir.
  if (sqliResult.skipped) {
    log('sqli findings: result skipped, no-op', { asset: asset.value, skipReason: sqliResult.skipReason });
    return;
  }

  // Per-result try/catch — tek bir hedefin DB hatası diğerlerini engellemesin.
  // Mevcut diğer processor'larda (port.findings, tls.findings) aynı pattern var.
  for (const result of sqliResult.results) {
    try {
      await processSingleResult(prisma, asset, scanRunId, result);
    } catch (err) {
      log('sqli findings: per-result error, continuing', {
        targetId: result.targetId,
        error: (err as Error).message ?? String(err),
      });
    }
  }
}

async function processSingleResult(
  prisma: PrismaClient,
  asset: Asset,
  scanRunId: string,
  result: SqliTargetResult,
): Promise<void> {
  const key = buildSqliFindingKey(asset.value, result.path, result.param);

  // Not suspected (signal yok) veya risk null → resolve.
  // resolveFinding sadece açık (resolvedAt=null) bulgular için no-op değil.
  if (!result.suspected || result.risk === null) {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('sqli finding resolved', { key });
    return;
  }

  const severity = result.risk; // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  const aiScore = result.aiScore ?? AI_SCORE_FALLBACK[severity] ?? 0;
  const rec = forSqliSuspected({
    path: result.path,
    param: result.param,
    signals: result.signals,
    confirmed: result.confirmed,
  });

  await upsertFinding(prisma, {
    assetId: asset.id,
    scanRunId,
    key,
    type: FindingTypes.SQL_INJECTION_SUSPECTED,
    severity,
    aiScore,
    dataJson: {
      url: result.url,
      method: result.method,
      path: result.path,
      param: result.param,
      payloadId: result.payloadId,
      payloadCategory: result.payloadCategory,
      suspected: result.suspected,
      risk: result.risk,
      confirmed: result.confirmed,
      signals: result.signals,
      evidence: result.evidence,
      checkedAt: result.checkedAt,
    } as unknown as Record<string, unknown>,
    aiWhyJson: {
      ...rec,
      signals: result.signals,
    },
  });
  log('sqli finding upserted', {
    key, severity, aiScore, confirmed: result.confirmed, signals: result.signals,
  });
}
