// Public Web Intelligence — verified asset gerektirmeyen public URL üzerinde
// Playwright screenshot + DOM extract + rule-based analiz + AI vision.
//
// Akış (iki aşamalı DB yazımı — frontend staged UX için kritik):
//   1. Playwright ile screenshot al + DOM extract et
//   2. PARTIAL UPDATE: status hâlâ RUNNING; screenshot/path/title/h1/visibleText
//      DB'ye yazılır. Frontend bu noktada polling'de screenshot'u alıp ekrana
//      bastırabilir.
//   3. AI vision çağrısı (varsa).
//   4. FINAL UPDATE: status=DONE, aiVisualAnalysisJson dolu.
//
// Hata davranışı: Hiçbir aşama throw etmez — her hata status=FAILED + error
// alanı doldurularak yumuşak başarısızlık olarak rapor edilir.

import * as os from 'node:os';
import * as path from 'node:path';
import { chromium, type Browser } from 'playwright';

import type { PrismaClient, Prisma } from '@prisma/client';

import { captureScreenshot } from './checks/visual/screenshot';
import { extractDom } from './checks/visual/dom-extract';
import { analyzeVisual } from './checks/visual/rule-analyzer';
import { analyzeScreenshotWithAi } from './checks/visual/ai-visual-analyzer';
import { log } from './utils/logger';

const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;
const PAGE_LOAD_TIMEOUT_MS = 15_000;
const USER_AGENT = 'ASM-Scanner/1.0 visual-public';

function defaultScreenshotDir(): string {
  const envRoot = process.env.VISUAL_SCREENSHOT_DIR;
  return envRoot && envRoot.trim().length > 0
    ? envRoot
    : path.join(os.tmpdir(), 'asm-visual-screenshots');
}

// Screenshot helper hostname-bazlı bir isim istiyor; URL'den türetiyoruz.
function deriveAssetKey(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase() || 'public';
  } catch {
    return 'public';
  }
}

export interface RunPublicVisualInput {
  runId: string;
  url: string;
  screenshotDir?: string;
}

export async function runPublicVisualAnalysis(
  prisma: PrismaClient,
  input: RunPublicVisualInput,
): Promise<void> {
  const { runId, url } = input;
  const screenshotDir = input.screenshotDir ?? defaultScreenshotDir();

  log('public-visual job start', { runId, url });

  let browser: Browser | null = null;
  try {
    browser = await launchBrowserWithRetry();
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      userAgent: USER_AGENT,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    let finalUrl: string | null = null;
    let statusCode: number | null = null;
    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_LOAD_TIMEOUT_MS,
      });
      finalUrl = page.url();
      statusCode = response?.status() ?? null;
    } catch (navErr) {
      const message = (navErr as Error).message ?? 'NAVIGATE_FAILED';
      await markFailed(prisma, runId, `PAGE_LOAD_FAILED: ${message}`);
      return;
    }

    // Screenshot
    const assetKey = deriveAssetKey(url);
    const screenshot = await captureScreenshot({
      page,
      assetValue: assetKey,
      screenshotDir,
    });

    // DOM extract
    const dom = await extractDom(page);

    // Rule analyzer
    const rule = analyzeVisual({
      title: dom.title,
      metaDescription: dom.metaDescription,
      h1Texts: dom.h1Texts,
      visibleText: dom.visibleText,
      linkCount: dom.linkCount,
      formCount: dom.formCount,
      inputCount: dom.inputCount,
      buttonCount: dom.buttonCount,
      hasPasswordInput: dom.hasPasswordInput,
      hasLoginTextInForm: dom.hasLoginTextInForm,
    });

    // PARTIAL UPDATE: status hâlâ RUNNING ama screenshot+DOM hazır.
    // Frontend bu noktada screenshot'u ekrana alıp "AI hazırlanıyor" UI'sini gösterir.
    const truncatedVisibleText =
      dom.visibleText && dom.visibleText.length > 8_000
        ? dom.visibleText.slice(0, 8_000)
        : dom.visibleText;

    await prisma.publicVisualAnalysisRun.update({
      where: { id: runId },
      data: {
        finalUrl,
        statusCode,
        screenshotPath: screenshot.path,
        screenshotHash: screenshot.hash,
        screenshotWidth: screenshot.width,
        screenshotHeight: screenshot.height,
        title: dom.title,
        metaDescription: dom.metaDescription,
        h1TextsJson: dom.h1Texts as unknown as Prisma.InputJsonValue,
        visibleText: truncatedVisibleText,
        visibleTextHash: dom.visibleTextHash,
        ruleSiteCategory: rule.siteCategory,
        rulePurposeSummary: rule.purposeSummary,
        ruleLanguage: rule.language,
        ruleSignalsJson: rule.signals as unknown as Prisma.InputJsonValue,
        ruleRiskLevel: rule.riskLevel,
      },
    });

    // AI vision — env-gated. ENABLE_VISUAL_AI=false ise null döner ve final
    // update status=DONE, aiJson=null yapar (yine de kullanıcı screenshot ve
    // rule-based çıktıyı görür).
    let aiJson: unknown = null;
    if (process.env.ENABLE_VISUAL_AI === 'true' && screenshot.path) {
      const provider = process.env.VISUAL_AI_PROVIDER ?? 'ollama';
      const baseUrl = process.env.VISUAL_AI_BASE_URL ?? 'http://localhost:11434';
      const model = process.env.VISUAL_AI_MODEL ?? 'llava:latest';
      const timeoutRaw = Number(process.env.VISUAL_AI_TIMEOUT_MS);
      const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 60_000;

      const ai = await analyzeScreenshotWithAi({
        screenshotPath: screenshot.path,
        pageContext: {
          url,
          finalUrl,
          title: dom.title,
          metaDescription: dom.metaDescription,
          h1Texts: dom.h1Texts,
          visibleTextSample: dom.visibleText,
          ruleBasedCategory: rule.siteCategory,
          ruleBasedSignals: rule.signals,
          ruleBasedRiskLevel: rule.riskLevel,
        },
        provider,
        baseUrl,
        model,
        timeoutMs,
      });
      // AI rawText'i DB için 4000 char ile kırp (snapshot persistence ile aynı).
      aiJson = ai.rawText && ai.rawText.length > 4_000
        ? { ...ai, rawText: ai.rawText.slice(0, 4_000) }
        : ai;
    }

    // FINAL UPDATE
    await prisma.publicVisualAnalysisRun.update({
      where: { id: runId },
      data: {
        status: 'DONE',
        finishedAt: new Date(),
        aiVisualAnalysisJson: aiJson as Prisma.InputJsonValue,
        // Screenshot veya DOM kısmen başarısızsa da DONE yapıyoruz; ayrı
        // bir alan yerine error alanını yalnızca tam başarısızlıkta kullanırız.
        error: (screenshot.error ?? dom.error ?? null) as string | null,
      },
    });

    log('public-visual job done', { runId, hasAi: aiJson !== null });
  } catch (err) {
    const rawMessage = (err as Error).message ?? 'UNKNOWN_ERROR';
    // Playwright launch failure'ı kategorize et — UI tarafında daha sade mesaj
    // gösterilebilsin. Stack/CLI args'lı devasa Playwright error'ları kullanıcıya
    // okutmayız; ilk satırı tutuyoruz.
    const firstLine = rawMessage.split('\n')[0];
    let categorized: string;
    if (rawMessage.includes('CHROMIUM_LAUNCH_FAILED') || rawMessage.includes('browserType.launch')) {
      categorized = 'CHROMIUM_LAUNCH_FAILED: Browser process başlatılamadı. Lütfen tekrar deneyin.';
    } else {
      categorized = `UNEXPECTED: ${firstLine}`;
    }
    log('public-visual job exception', { runId, error: firstLine?.slice(0, 200) });
    await markFailed(prisma, runId, categorized);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

// Windows Playwright chromium-headless-shell zaman zaman ilk launch'ta
// STATUS_DLL_INIT_FAILED (exitCode 0xC0000142) ile crash ediyor — antivirüs
// veya transient OS state. 3 deneme + exponential backoff ile bunu tolere et.
async function launchBrowserWithRetry(): Promise<Browser> {
  const attempts = 3;
  const baseDelayMs = 1500;
  let lastErr: Error | null = null;

  for (let i = 0; i < attempts; i++) {
    try {
      return await chromium.launch({ headless: true });
    } catch (err) {
      lastErr = err as Error;
      log('chromium launch failed', {
        attempt: i + 1,
        of: attempts,
        message: lastErr.message?.slice(0, 200),
      });
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, i)));
      }
    }
  }
  throw new Error(`CHROMIUM_LAUNCH_FAILED after ${attempts} attempts: ${lastErr?.message ?? 'unknown'}`);
}

async function markFailed(prisma: PrismaClient, runId: string, error: string): Promise<void> {
  try {
    await prisma.publicVisualAnalysisRun.update({
      where: { id: runId },
      data: { status: 'FAILED', error, finishedAt: new Date() },
    });
  } catch (dbErr) {
    log('public-visual markFailed update error', {
      runId,
      error: (dbErr as Error).message ?? String(dbErr),
    });
  }
}
