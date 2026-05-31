// Visual Website Analyzer — C.5 smoke test (manuel, geçici).
//
// Amaç:
//   1. checkVisualAnalysis ile gerçek bir VERIFIED DOMAIN için tarama yap
//   2. persistVisualAnalysisRun ile DB'ye VisualAnalysisRun kaydı yaz
//   3. Sonucu konsola yaz (API endpoint testleri bunun üzerine yapılır)
//
// Çalıştırma:
//   cd e:\Projects\asm\apps\worker
//   $env:VISUAL_SMOKE_ASSET_VALUE = "oguzhanaslan.cloud"     # default
//   pnpm exec tsx .\visual-db-smoke-test.ts
//
// Opsiyonel env:
//   VISUAL_SMOKE_ASSET_VALUE  Hangi asset'i taranacak (default: oguzhanaslan.cloud)
//   VISUAL_SMOKE_URL          Doğrudan URL ver (allowlist asset.value'ya göre kontrol eder)
//   VISUAL_SCREENSHOT_DIR     Screenshot kaydedileceği dizin (default: ./visual-smoke)
//
// Önemli:
//   - apps/worker/.env içindeki DATABASE_URL kullanılır (worker.ts ile aynı pattern)
//   - Asset DB'de VERIFIED + DOMAIN olmalı; aksi takdirde checkVisualAnalysis skipped döner
//   - Bu dosya production koduna bağlı DEĞİL; sadece manuel smoke test için

import path from 'node:path';
import dotenv from 'dotenv';

// Worker.ts ile aynı .env yükleme pattern'i
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { checkVisualAnalysis } from './src/checks/visual.check';
import { persistVisualAnalysisRun } from './src/checks/visual/visual-persistence';

const DEFAULT_ASSET_VALUE = 'oguzhanaslan.cloud';
const DEFAULT_SCREENSHOT_DIR = path.resolve(__dirname, 'visual-smoke');

async function main(): Promise<void> {
  const assetValue = process.env.VISUAL_SMOKE_ASSET_VALUE ?? DEFAULT_ASSET_VALUE;
  const screenshotDir = process.env.VISUAL_SCREENSHOT_DIR ?? DEFAULT_SCREENSHOT_DIR;
  const explicitUrl = process.env.VISUAL_SMOKE_URL;

  console.log('─── Visual smoke test ───');
  console.log('assetValue:    ', assetValue);
  console.log('screenshotDir: ', screenshotDir);
  if (explicitUrl) console.log('explicitUrl:   ', explicitUrl);

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL eksik — apps/worker/.env dosyasını kontrol et');
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    // 1. Asset bilgisini DB'den oku
    const asset = await prisma.asset.findFirst({
      where: { value: assetValue },
      select: { id: true, value: true, type: true, status: true, userId: true },
    });

    if (!asset) {
      throw new Error(`Asset bulunamadı: value=${assetValue}. Önce assete kayıt ekle ve VERIFY et.`);
    }

    console.log('\n─── Asset DB record ───');
    console.log('id:     ', asset.id);
    console.log('type:   ', asset.type);
    console.log('status: ', asset.status);

    if (asset.type !== 'DOMAIN') {
      console.warn('⚠ Asset DOMAIN değil — checkVisualAnalysis NOT_DOMAIN skipped dönecek.');
    }
    if (asset.status !== 'VERIFIED') {
      console.warn('⚠ Asset VERIFIED değil — checkVisualAnalysis NOT_VERIFIED skipped dönecek.');
    }

    // 2. checkVisualAnalysis çalıştır
    console.log('\n─── Running checkVisualAnalysis (browser kalkıyor, ~5-10s) ───');
    const t0 = Date.now();
    const visualResult = await checkVisualAnalysis({
      asset: { id: asset.id, value: asset.value, type: asset.type, status: asset.status },
      url: explicitUrl,
      screenshotDir,
    });
    const t1 = Date.now();
    console.log(`✓ checkVisualAnalysis tamamlandı (${t1 - t0}ms)`);

    // 3. DB'ye yaz
    console.log('\n─── Persisting VisualAnalysisRun ───');
    const persisted = await persistVisualAnalysisRun(prisma, {
      assetId: asset.id,
      visualResult,
    }) as { id: string; createdAt: Date };

    console.log('✓ DB kaydı oluştu');

    // 4. Özet rapor
    console.log('\n─── SMOKE TEST RESULT ───');
    const ai = visualResult.aiVisualAnalysis;
    console.log(JSON.stringify({
      runId: persisted.id,
      createdAt: persisted.createdAt,
      assetId: asset.id,
      assetValue: asset.value,
      url: visualResult.url,
      finalUrl: visualResult.finalUrl,
      statusCode: visualResult.statusCode,
      skipped: visualResult.skipped,
      skipReason: visualResult.skipReason,
      screenshotPath: visualResult.screenshotPath,
      screenshotHash: visualResult.screenshotHash?.slice(0, 16) + '…',
      screenshotSize: `${visualResult.screenshotWidth}x${visualResult.screenshotHeight}`,
      title: visualResult.title,
      siteCategory: visualResult.siteCategory,
      purposeSummary: visualResult.purposeSummary,
      language: visualResult.language,
      signals: visualResult.signals,
      riskLevel: visualResult.riskLevel,
      error: visualResult.error ?? null,
      aiVisualAnalysis: ai
        ? {
            enabled: ai.enabled,
            provider: ai.provider,
            model: ai.model,
            sitePurpose: ai.sitePurpose,
            siteCategory: ai.siteCategory,
            visualSummary: ai.visualSummary,
            visibleElements: ai.visibleElements,
            securitySignals: ai.securitySignals,
            riskLevel: ai.riskLevel,
            securityCommentary: ai.securityCommentary,
            recommendations: ai.recommendations,
            manualVerificationNeeded: ai.manualVerificationNeeded,
            rawText: ai.rawText ? ai.rawText.slice(0, 1200) + (ai.rawText.length > 1200 ? '…' : '') : null,
            error: ai.error ?? null,
            checkedAt: ai.checkedAt,
          }
        : null,
    }, null, 2));

    console.log('\n─── Next steps ───');
    console.log(`assetId: ${asset.id}`);
    console.log(`runId:   ${persisted.id}`);
    console.log('\nAPI testleri (PowerShell):');
    console.log(`  $assetId = "${asset.id}"`);
    console.log(`  $runId   = "${persisted.id}"`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n✓ Smoke test başarılı');
    process.exit(0);
  })
  .catch((err: Error) => {
    console.error('\n✗ Smoke test başarısız');
    console.error(err.stack ?? err.message);
    process.exit(1);
  });
