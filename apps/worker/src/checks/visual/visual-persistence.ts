import type { PrismaClient, Prisma } from '@prisma/client';
import type { AiVisualAnalysisResult, VisualAnalysisResult } from './visual-types';

// visibleText'i DB'ye yazmadan önce güvenli kısaltma — model @db.Text olsa da
// network payload + memory için makul üst sınır.
const VISIBLE_TEXT_DB_MAX = 8_000;
// AI raw response'u JSON içine kalıcı yazıldığında satır uzunluğu patlamasın.
const AI_RAW_TEXT_DB_MAX = 4_000;

// AI analiz sonucunu DB'ye yazmadan önce raw text alanını güvenli kırp.
// Null girişi olduğu gibi koru — disable durumunda diğer aşamalar null bekliyor.
function truncateAiVisualForDb(ai: AiVisualAnalysisResult | null): AiVisualAnalysisResult | null {
  if (!ai) return null;
  if (!ai.rawText || ai.rawText.length <= AI_RAW_TEXT_DB_MAX) return ai;
  return { ...ai, rawText: ai.rawText.slice(0, AI_RAW_TEXT_DB_MAX) };
}

interface PersistInput {
  assetId: string;
  visualResult: VisualAnalysisResult;
}

// VisualAnalysisRun DB kaydı oluşturur. Şu an runScan entegrasyonu yok;
// fonksiyon hata fırlatırsa çağıran tarafın yakalaması gerekir (sonraki
// sprint'te safeCheck wrapper'la sarılacak).
export async function persistVisualAnalysisRun(
  prisma: PrismaClient,
  { assetId, visualResult }: PersistInput,
) {
  const truncatedVisibleText =
    visualResult.visibleText && visualResult.visibleText.length > VISIBLE_TEXT_DB_MAX
      ? visualResult.visibleText.slice(0, VISIBLE_TEXT_DB_MAX)
      : (visualResult.visibleText ?? null);

  // analysisJson içine rule analyzer detayı + skip/error meta + AI sonucu
  // birlikte gider. Böylece tek bir JSON alanında "bu çalıştırma ne yaptı"
  // bilgisi tam dolu.
  const analysisPayload = {
    ...visualResult.analysis,
    skipped: visualResult.skipped,
    skipReason: visualResult.skipReason ?? null,
    error: visualResult.error ?? null,
    checkedAt: visualResult.checkedAt,
    aiVisualAnalysis: truncateAiVisualForDb(visualResult.aiVisualAnalysis ?? null),
  };

  return prisma.visualAnalysisRun.create({
    data: {
      assetId,

      url: visualResult.url ?? '',
      finalUrl: visualResult.finalUrl,
      statusCode: visualResult.statusCode,

      screenshotPath: visualResult.screenshotPath,
      screenshotHash: visualResult.screenshotHash,
      screenshotWidth: visualResult.screenshotWidth,
      screenshotHeight: visualResult.screenshotHeight,

      title: visualResult.title,
      metaDescription: visualResult.metaDescription,
      h1TextsJson: visualResult.h1Texts as unknown as Prisma.InputJsonValue,
      visibleText: truncatedVisibleText,
      visibleTextHash: visualResult.visibleTextHash,

      siteCategory: visualResult.siteCategory,
      purposeSummary: visualResult.purposeSummary,
      language: visualResult.language,

      signalsJson: visualResult.signals as unknown as Prisma.InputJsonValue,
      analysisJson: analysisPayload as unknown as Prisma.InputJsonValue,
      riskLevel: visualResult.riskLevel,

      error: visualResult.error ?? null,
    },
  });
}

// Test exports — sabit/limit dış erişim için
export const VISUAL_PERSISTENCE_LIMITS = {
  VISIBLE_TEXT_DB_MAX,
  AI_RAW_TEXT_DB_MAX,
} as const;

export const __testables = { truncateAiVisualForDb };
