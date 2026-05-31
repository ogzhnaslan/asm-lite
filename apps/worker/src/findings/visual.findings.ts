import type { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { forVisualSignal, type VisualSignalKey } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { VisualAnalysisResult } from '../checks/visual/visual-types';

interface Asset {
  id: string;
  value: string;
}

interface ProcessVisualFindingsParams {
  asset: Asset;
  scanRunId: string;
  visualResult: VisualAnalysisResult;
  visualRunId?: string | null;
}

// Tüm görsel sinyaller — her scan'de hepsi için upsert/resolve kontrolü
// yapılır. Sinyal `visualResult.signals` içindeyse upsert, değilse resolve.
// Bu sayede sinyaller kaybolduğunda eski finding'ler otomatik kapanır.
const ALL_VISUAL_SIGNALS: readonly VisualSignalKey[] = [
  'LOGIN_PANEL_VISIBLE',
  'ADMIN_PANEL_VISIBLE',
  'DEFAULT_SERVER_PAGE_VISIBLE',
  'ERROR_PAGE_VISIBLE',
  'EMPTY_PAGE_DETECTED',
] as const;

type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

const SCORE_MAP: Record<Severity, number> = {
  LOW: 35,
  MEDIUM: 65,
  HIGH: 85,
};

// Severity escalation:
// - ADMIN_PANEL_VISIBLE tek başına → MEDIUM, LOGIN veya ERROR ile birlikte → HIGH
// - LOGIN_PANEL_VISIBLE / EMPTY_PAGE_DETECTED → LOW
// - DEFAULT_SERVER_PAGE_VISIBLE / ERROR_PAGE_VISIBLE → MEDIUM
function computeSeverity(signal: VisualSignalKey, allSignals: readonly string[]): Severity {
  const has = (s: string): boolean => allSignals.includes(s);

  if (signal === 'ADMIN_PANEL_VISIBLE') {
    if (has('LOGIN_PANEL_VISIBLE') || has('ERROR_PAGE_VISIBLE')) return 'HIGH';
    return 'MEDIUM';
  }
  if (signal === 'LOGIN_PANEL_VISIBLE') return 'LOW';
  if (signal === 'EMPTY_PAGE_DETECTED') return 'LOW';
  if (signal === 'DEFAULT_SERVER_PAGE_VISIBLE') return 'MEDIUM';
  if (signal === 'ERROR_PAGE_VISIBLE') return 'MEDIUM';
  return 'LOW';
}

// Shared FindingTypes object → signal key'leri ile birebir eşleşir.
// Strict mapping (signal === FindingType) guarantee'sini test'le doğrularız.
function findingTypeFor(signal: VisualSignalKey): string {
  switch (signal) {
    case 'LOGIN_PANEL_VISIBLE':          return FindingTypes.LOGIN_PANEL_VISIBLE;
    case 'ADMIN_PANEL_VISIBLE':          return FindingTypes.ADMIN_PANEL_VISIBLE;
    case 'DEFAULT_SERVER_PAGE_VISIBLE':  return FindingTypes.DEFAULT_SERVER_PAGE_VISIBLE;
    case 'ERROR_PAGE_VISIBLE':           return FindingTypes.ERROR_PAGE_VISIBLE;
    case 'EMPTY_PAGE_DETECTED':          return FindingTypes.EMPTY_PAGE_DETECTED;
  }
}

export function buildVisualFindingKey(signal: VisualSignalKey, assetValue: string): string {
  return `VISUAL:${signal}:${assetValue}`;
}

export async function processVisualFindings(
  prisma: PrismaClient,
  params: ProcessVisualFindingsParams,
): Promise<void> {
  const { asset, scanRunId, visualResult, visualRunId } = params;

  // Global guard: check error (CHECK_CRASHED veya PAGE_LOAD_FAILED) → eski
  // finding'leri olduğu gibi bırak, yeni finding üretme. Mevcut SQLi/port
  // pattern'iyle aynı yaklaşım.
  if (visualResult.error) {
    log('visual findings: check error, skipping', { asset: asset.value, error: visualResult.error });
    return;
  }
  if (visualResult.skipped) {
    log('visual findings: result skipped, no-op', { asset: asset.value, skipReason: visualResult.skipReason });
    return;
  }

  // Her sinyal için upsert/resolve — per-signal try/catch ile izolasyon.
  for (const signal of ALL_VISUAL_SIGNALS) {
    try {
      await processSingleSignal(prisma, asset, scanRunId, visualResult, visualRunId ?? null, signal);
    } catch (err) {
      log('visual findings: per-signal error, continuing', {
        signal, error: (err as Error).message ?? String(err),
      });
    }
  }
}

async function processSingleSignal(
  prisma: PrismaClient,
  asset: Asset,
  scanRunId: string,
  visualResult: VisualAnalysisResult,
  visualRunId: string | null,
  signal: VisualSignalKey,
): Promise<void> {
  const key = buildVisualFindingKey(signal, asset.value);
  const present = visualResult.signals.includes(signal);

  if (!present) {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('visual finding resolved (signal absent)', { key });
    return;
  }

  const severity = computeSeverity(signal, visualResult.signals);
  const aiScore = SCORE_MAP[severity];
  const rec = forVisualSignal({
    signal,
    url: visualResult.url,
    title: visualResult.title,
    siteCategory: visualResult.siteCategory,
    signals: visualResult.signals,
    detectedKeywords: visualResult.analysis.detectedKeywords,
  });

  // dataJson içine visualRunId, screenshot meta + analysis + signal context.
  // Raw screenshotPath dahil — API tarafında frontend'e direkt çıkmadan önce
  // service katmanı bunu screenshotUrl'e çevirir (Adım C).
  const dataJson: Record<string, unknown> = {
    visualRunId,
    url: visualResult.url,
    finalUrl: visualResult.finalUrl,
    statusCode: visualResult.statusCode,
    title: visualResult.title,
    siteCategory: visualResult.siteCategory,
    purposeSummary: visualResult.purposeSummary,
    language: visualResult.language,
    signal,                         // bu finding'in tek tetikleyici sinyali
    signals: visualResult.signals,  // o scan'deki tüm sinyaller (severity escalation için)
    riskLevel: visualResult.riskLevel,
    screenshotUrlHint: visualRunId ? `/assets/${asset.id}/visual-analysis/${visualRunId}/screenshot` : null,
    screenshotPath: visualResult.screenshotPath,
    screenshotHash: visualResult.screenshotHash,
    screenshotWidth: visualResult.screenshotWidth,
    screenshotHeight: visualResult.screenshotHeight,
    analysis: visualResult.analysis,
    checkedAt: visualResult.checkedAt,
  };

  await upsertFinding(prisma, {
    assetId: asset.id,
    scanRunId,
    key,
    type: findingTypeFor(signal),
    severity,
    aiScore,
    dataJson,
    aiWhyJson: { ...rec, signals: visualResult.signals },
  });
  log('visual finding upserted', { key, severity, aiScore, signals: visualResult.signals });
}
