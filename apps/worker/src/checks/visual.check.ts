import * as os from 'node:os';
import * as path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

import { captureScreenshot } from './visual/screenshot';
import { extractDom } from './visual/dom-extract';
import { analyzeVisual } from './visual/rule-analyzer';
import { analyzeScreenshotWithAi, buildDisabledAiResult } from './visual/ai-visual-analyzer';
import type {
  VisualAnalysisInput,
  VisualAnalysisResult,
  VisualAnalysisAssetInput,
  VisualSkipReason,
  AiVisualAnalysisResult,
} from './visual/visual-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;
const PAGE_LOAD_TIMEOUT_MS = 10_000;
const USER_AGENT = 'ASM-Scanner/1.0 visual-analyzer';

const DEFAULT_SCREENSHOT_DIR = path.join(os.tmpdir(), 'asm-visual-screenshots');

// ─── URL allowlist — SSRF / etik sınır ────────────────────────────────────────
// Verified asset.value ve www.* + alt-subdomain'leri kabul; başka host'lar reddedilir.
// Mevcut assets.service.ts:verifyHttp pattern'iyle bilinçli uyumlu.

export function isUrlAllowedForAsset(url: string, assetValue: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  const asset = assetValue.toLowerCase();
  return host === asset || host === `www.${asset}` || host.endsWith(`.${asset}`);
}

// ─── Result builders ──────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function makeSkipped(assetValue: string, reason: VisualSkipReason, url: string | null = null): VisualAnalysisResult {
  return {
    enabled: true,
    skipped: true,
    skipReason: reason,
    assetValue,
    url,
    finalUrl: null,
    statusCode: null,
    screenshotPath: null, screenshotHash: null, screenshotWidth: null, screenshotHeight: null,
    title: null, metaDescription: null, h1Texts: [], visibleText: null, visibleTextHash: null,
    siteCategory: null, purposeSummary: null, language: null,
    signals: [], riskLevel: null,
    analysis: emptyAnalysis(),
    aiVisualAnalysis: null,
    checkedAt: now(),
  };
}

function emptyAnalysis(): VisualAnalysisResult['analysis'] {
  return {
    hasLoginForm: false, hasPasswordInput: false, hasAdminHints: false,
    hasDefaultServerPage: false, hasErrorPage: false, isEmptyPage: false,
    linkCount: 0, formCount: 0, inputCount: 0, buttonCount: 0,
    detectedKeywords: [],
  };
}

// ─── Browser lifecycle ────────────────────────────────────────────────────────

interface NavigationResult {
  page: Page;
  finalUrl: string;
  statusCode: number | null;
  error: string | null;
}

async function tryNavigate(browser: Browser, candidateUrls: string[]): Promise<NavigationResult> {
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    userAgent: USER_AGENT,
    // Sertifika hataları bizim verified asset için bilgilendirici olur, scan'i
    // patlatmamalı. TLS check ayrı bir modülde detaylı raporlanır.
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  let lastError: string | null = null;
  for (const url of candidateUrls) {
    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_LOAD_TIMEOUT_MS,
      });
      return {
        page,
        finalUrl: page.url(),
        statusCode: response?.status() ?? null,
        error: null,
      };
    } catch (err) {
      lastError = (err as Error).message ?? 'NAVIGATE_FAILED';
    }
  }
  // Tüm denemeler başarısız — context'i kapat, page yine de "boş" döner ki
  // çağıran taraf ne yapacağına karar versin.
  await context.close().catch(() => undefined);
  return { page, finalUrl: '', statusCode: null, error: lastError ?? 'PAGE_LOAD_FAILED' };
}

// ─── AI vision gate ───────────────────────────────────────────────────────────

interface AiGateInput {
  screenshotPath: string | null;
  pageContext: import('./visual/visual-types').AiVisualPageContext;
}

async function maybeRunAiVisualAnalysis({ screenshotPath, pageContext }: AiGateInput): Promise<AiVisualAnalysisResult | null> {
  // env gate — varsayılan kapalı. ENABLE_VISUAL_AI=true olduğunda devreye girer.
  if (process.env.ENABLE_VISUAL_AI !== 'true') return null;
  // Screenshot yoksa AI'ya gönderilecek görüntü de yok → güvenli null.
  if (!screenshotPath) return null;

  const provider = process.env.VISUAL_AI_PROVIDER ?? 'ollama';
  const baseUrl = process.env.VISUAL_AI_BASE_URL ?? 'http://localhost:11434';
  const model = process.env.VISUAL_AI_MODEL ?? 'llava:latest';
  const timeoutRaw = Number(process.env.VISUAL_AI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 30_000;

  // analyzeScreenshotWithAi throw etmeyecek şekilde tasarlandı — yine de
  // savunma amaçlı try/catch koyuyoruz ki check'in bütünü kesinlikle patlamasın.
  try {
    return await analyzeScreenshotWithAi({
      screenshotPath,
      pageContext,
      provider,
      baseUrl,
      model,
      timeoutMs,
    });
  } catch (err) {
    return {
      ...buildDisabledAiResult(),
      enabled: true,
      provider,
      model,
      error: `AI_UNEXPECTED_ERROR: ${(err as Error).message ?? 'unknown'}`,
      manualVerificationNeeded: true,
    };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function checkVisualAnalysis(input: VisualAnalysisInput): Promise<VisualAnalysisResult> {
  const { asset } = input;
  const assetValue = asset.value;

  // Guard: DOMAIN dışı asset için bu modül anlamsız (IP'lerin görsel kimliği yok).
  if (asset.type !== 'DOMAIN') {
    return makeSkipped(assetValue, 'NOT_DOMAIN');
  }
  // Guard: VERIFIED olmayan asset'te görsel analiz yapma (etik + tutarlılık).
  if (asset.status !== 'VERIFIED') {
    return makeSkipped(assetValue, 'NOT_VERIFIED');
  }

  // URL allowlist — kullanıcı yanlışlıkla veya kötü niyetle başka domain veremesin.
  let candidateUrls: string[];
  if (input.url) {
    if (!isUrlAllowedForAsset(input.url, assetValue)) {
      return makeSkipped(assetValue, 'INVALID_URL', input.url);
    }
    candidateUrls = [input.url];
  } else {
    candidateUrls = [`https://${assetValue}`, `http://${assetValue}`];
  }

  const screenshotDir = input.screenshotDir ?? DEFAULT_SCREENSHOT_DIR;

  // Browser ömrü try/finally ile yönetilir — herhangi bir adımda hata çıksa
  // bile chromium process kapanır (memory leak engellemek için).
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });

    const nav = await tryNavigate(browser, candidateUrls);
    if (nav.error || !nav.finalUrl) {
      return {
        ...makeSkipped(assetValue, 'PAGE_LOAD_FAILED', candidateUrls[0] ?? null),
        error: nav.error ?? 'PAGE_LOAD_FAILED',
      };
    }

    // Screenshot ve DOM extraction'ı paralel değil sequential yapıyoruz
    // (aynı Page, aynı network state — sıralı daha öngörülebilir).
    const screenshot = await captureScreenshot({
      page: nav.page,
      assetValue,
      screenshotDir,
    });
    const dom = await extractDom(nav.page);

    const ruleResult = analyzeVisual({
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

    // Hem screenshot hem DOM hata verirse error alanına en bilgilendirici olanı koy.
    const error = screenshot.error || dom.error || undefined;

    // AI vision — env-gated, screenshot olmadan çalışmaz. Bu fonksiyon throw
    // etmeyecek şekilde tasarlandı; başarısızlık aiResult.error olarak döner.
    const aiVisualAnalysis = await maybeRunAiVisualAnalysis({
      screenshotPath: screenshot.path,
      pageContext: {
        url: candidateUrls[0] ?? null,
        finalUrl: nav.finalUrl,
        title: dom.title,
        metaDescription: dom.metaDescription,
        h1Texts: dom.h1Texts,
        visibleTextSample: dom.visibleText,
        ruleBasedCategory: ruleResult.siteCategory,
        ruleBasedSignals: ruleResult.signals,
        ruleBasedRiskLevel: ruleResult.riskLevel,
      },
    });

    return {
      enabled: true,
      skipped: false,
      assetValue,
      url: candidateUrls[0] ?? null,
      finalUrl: nav.finalUrl,
      statusCode: nav.statusCode,

      screenshotPath: screenshot.path,
      screenshotHash: screenshot.hash,
      screenshotWidth: screenshot.width,
      screenshotHeight: screenshot.height,

      title: dom.title,
      metaDescription: dom.metaDescription,
      h1Texts: dom.h1Texts,
      visibleText: dom.visibleText,
      visibleTextHash: dom.visibleTextHash,

      siteCategory: ruleResult.siteCategory,
      purposeSummary: ruleResult.purposeSummary,
      language: ruleResult.language,

      signals: ruleResult.signals,
      riskLevel: ruleResult.riskLevel,

      analysis: ruleResult.analysis,

      aiVisualAnalysis,

      checkedAt: now(),
      ...(error ? { error } : {}),
    };
  } catch (err) {
    // Catch-all — sınıf-tipi launch failure veya beklenmedik istisnalar.
    // safeCheck wrapper run-scan tarafında ayrı sarar; burada da defansif duralım.
    return {
      ...makeSkipped(assetValue, 'PAGE_LOAD_FAILED', candidateUrls[0] ?? null),
      error: (err as Error).message ?? 'VISUAL_CHECK_FAILED',
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

export function buildEmptyVisualResult(asset: VisualAnalysisAssetInput, error: string): VisualAnalysisResult {
  return {
    ...makeSkipped(asset.value, 'PAGE_LOAD_FAILED'),
    error,
  };
}
