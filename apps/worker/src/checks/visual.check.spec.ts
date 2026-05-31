// Visual Website Analyzer — unit testler.
//
// Strateji:
// - rule-analyzer.ts: saf fonksiyon → synthetic input ile mock'suz test
// - URL allowlist: saf fonksiyon → mock'suz test
// - orchestrator (visual.check.ts): playwright + sub-modüller mock'lu →
//   asıl test edilen şey guards, URL allowlist entegrasyonu, error handling,
//   sonuç assembly.
// Hiçbir test gerçek browser binary'sine veya internet erişimine ihtiyaç duymaz.

import * as path from 'node:path';
import * as os from 'node:os';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('playwright');
jest.mock('./visual/screenshot');
jest.mock('./visual/dom-extract');
jest.mock('./visual/ai-visual-analyzer', () => ({
  __esModule: true,
  analyzeScreenshotWithAi: jest.fn(),
  buildDisabledAiResult: jest.fn(() => ({
    enabled: false,
    provider: null,
    model: null,
    sitePurpose: null,
    siteCategory: null,
    visualSummary: null,
    visibleElements: [],
    securitySignals: [],
    riskLevel: null,
    securityCommentary: null,
    recommendations: [],
    manualVerificationNeeded: false,
    checkedAt: 'fake-iso',
  })),
}));

import { chromium } from 'playwright';
import { captureScreenshot } from './visual/screenshot';
import { extractDom } from './visual/dom-extract';
import { analyzeScreenshotWithAi } from './visual/ai-visual-analyzer';

import { checkVisualAnalysis, isUrlAllowedForAsset } from './visual.check';
import { analyzeVisual } from './visual/rule-analyzer';
import type {
  RuleAnalyzerInput,
  DomExtractionResult,
  ScreenshotResult,
  VisualAnalysisAssetInput,
} from './visual/visual-types';

// ─── Fixture builders ────────────────────────────────────────────────────────

const verifiedDomain: VisualAnalysisAssetInput = {
  id: 'asset-1', value: 'example.com', type: 'DOMAIN', status: 'VERIFIED',
};
const pendingDomain: VisualAnalysisAssetInput = { ...verifiedDomain, status: 'PENDING' };
const verifiedIp: VisualAnalysisAssetInput = { ...verifiedDomain, type: 'IP', value: '1.2.3.4' };

function ruleInput(overrides: Partial<RuleAnalyzerInput> = {}): RuleAnalyzerInput {
  return {
    title: null, metaDescription: null, h1Texts: [], visibleText: null,
    linkCount: 0, formCount: 0, inputCount: 0, buttonCount: 0,
    hasPasswordInput: false, hasLoginTextInForm: false,
    ...overrides,
  };
}

function mockedScreenshot(overrides: Partial<ScreenshotResult> = {}): ScreenshotResult {
  return {
    path: '/tmp/visual.png',
    hash: 'a'.repeat(64),
    width: 1440,
    height: 900,
    error: null,
    ...overrides,
  };
}

function mockedDom(overrides: Partial<DomExtractionResult> = {}): DomExtractionResult {
  return {
    title: 'Example',
    metaDescription: null,
    h1Texts: ['Hello'],
    visibleText: 'Some visible body text content',
    visibleTextHash: 'b'.repeat(64),
    linkCount: 5, formCount: 0, inputCount: 0, buttonCount: 0,
    hasPasswordInput: false, hasLoginTextInForm: false,
    error: null,
    ...overrides,
  };
}

// Playwright chromium.launch fake — verilen page üzerinden goto/url/screenshot vb.
function setupPlaywright(opts: {
  gotoStatus?: number;
  finalUrl?: string;
  gotoThrow?: Error;
} = {}): {
  launchMock: jest.Mock;
  browserClose: jest.Mock;
  contextClose: jest.Mock;
  pageGoto: jest.Mock;
} {
  const pageGoto = jest.fn().mockImplementation(() => {
    if (opts.gotoThrow) return Promise.reject(opts.gotoThrow);
    return Promise.resolve({ status: () => opts.gotoStatus ?? 200 });
  });
  const fakePage = {
    goto: pageGoto,
    url: () => opts.finalUrl ?? 'https://example.com/',
    screenshot: jest.fn().mockResolvedValue(Buffer.alloc(0)),
    viewportSize: () => ({ width: 1440, height: 900 }),
    evaluate: jest.fn().mockResolvedValue({}),
  };
  const contextClose = jest.fn().mockResolvedValue(undefined);
  const fakeContext = {
    newPage: jest.fn().mockResolvedValue(fakePage),
    close: contextClose,
  };
  const browserClose = jest.fn().mockResolvedValue(undefined);
  const fakeBrowser = {
    newContext: jest.fn().mockResolvedValue(fakeContext),
    close: browserClose,
  };
  const launchMock = chromium.launch as jest.Mock;
  launchMock.mockReset();
  launchMock.mockResolvedValue(fakeBrowser);
  return { launchMock, browserClose, contextClose, pageGoto };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Visual Website Analyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (captureScreenshot as jest.Mock).mockResolvedValue(mockedScreenshot());
    (extractDom as jest.Mock).mockResolvedValue(mockedDom());
    // Test izolasyonu: ENABLE_VISUAL_AI default kapalı.
    delete process.env.ENABLE_VISUAL_AI;
    (analyzeScreenshotWithAi as jest.Mock).mockReset();
  });

  // ─── 1. URL allowlist (saf fonksiyon) ─────────────────────────────────────

  describe('isUrlAllowedForAsset', () => {
    it('aynı domain kabul edilir', () => {
      expect(isUrlAllowedForAsset('https://example.com/', 'example.com')).toBe(true);
      expect(isUrlAllowedForAsset('https://example.com/path?q=1', 'example.com')).toBe(true);
    });

    it('www subdomain kabul edilir', () => {
      expect(isUrlAllowedForAsset('https://www.example.com/path', 'example.com')).toBe(true);
    });

    it('alt subdomain kabul edilir', () => {
      expect(isUrlAllowedForAsset('https://sub.example.com/x', 'example.com')).toBe(true);
      expect(isUrlAllowedForAsset('https://a.b.example.com/', 'example.com')).toBe(true);
    });

    it('case-insensitive eşleştirme', () => {
      expect(isUrlAllowedForAsset('https://Example.COM/', 'example.com')).toBe(true);
    });

    it('başka domain reddedilir', () => {
      expect(isUrlAllowedForAsset('https://evil.com/', 'example.com')).toBe(false);
      expect(isUrlAllowedForAsset('https://example.com.evil.com/', 'example.com')).toBe(false);
      expect(isUrlAllowedForAsset('https://fake-example.com/', 'example.com')).toBe(false);
    });

    it('http/https dışı şema reddedilir', () => {
      expect(isUrlAllowedForAsset('file:///etc/passwd', 'example.com')).toBe(false);
      expect(isUrlAllowedForAsset('javascript:alert(1)', 'example.com')).toBe(false);
      expect(isUrlAllowedForAsset('ftp://example.com/', 'example.com')).toBe(false);
    });

    it('geçersiz URL reddedilir', () => {
      expect(isUrlAllowedForAsset('not-a-url', 'example.com')).toBe(false);
      expect(isUrlAllowedForAsset('', 'example.com')).toBe(false);
    });
  });

  // ─── 2. Rule analyzer — saf fonksiyon ─────────────────────────────────────

  describe('analyzeVisual', () => {
    it('hiç sinyal yoksa risk LOW (empty-page eşiklerinin üstünde, kategori keyword yok)', () => {
      const r = analyzeVisual(ruleInput({
        // Yeterince uzun visibleText + linkCount/inputCount empty-page eşiklerinin üstünde,
        // ama hiçbir kategori/sinyal kelimesi yok.
        visibleText: 'Bu sayfa hakkında genel bilgi içerir. Daha fazlası için aşağıdaki içeriklere bakın.',
        linkCount: 10,
        inputCount: 1,
      }));
      expect(r.signals).toEqual([]);
      expect(r.riskLevel).toBe('LOW');
    });

    it('password input → LOGIN_PANEL_VISIBLE', () => {
      const r = analyzeVisual(ruleInput({ hasPasswordInput: true, formCount: 1 }));
      expect(r.signals).toContain('LOGIN_PANEL_VISIBLE');
      expect(r.analysis.hasLoginForm).toBe(true);
      expect(r.analysis.hasPasswordInput).toBe(true);
    });

    it('form + "giriş" text → LOGIN_PANEL_VISIBLE', () => {
      const r = analyzeVisual(ruleInput({
        formCount: 1, hasLoginTextInForm: true, visibleText: 'Kullanıcı girişi',
      }));
      expect(r.signals).toContain('LOGIN_PANEL_VISIBLE');
    });

    it('admin kelimesi → ADMIN_PANEL_VISIBLE', () => {
      const r = analyzeVisual(ruleInput({
        title: 'Administrator Dashboard',
        visibleText: 'admin paneli yönetim ekranı',
      }));
      expect(r.signals).toContain('ADMIN_PANEL_VISIBLE');
      expect(r.analysis.hasAdminHints).toBe(true);
    });

    it('Apache default page → DEFAULT_SERVER_PAGE_VISIBLE', () => {
      const r = analyzeVisual(ruleInput({
        title: 'Apache2 Ubuntu Default Page',
        visibleText: 'Apache2 ubuntu default page: It works!',
      }));
      expect(r.signals).toContain('DEFAULT_SERVER_PAGE_VISIBLE');
      expect(r.analysis.hasDefaultServerPage).toBe(true);
      expect(r.siteCategory).toBe('default-server-page');
    });

    it('Nginx welcome → DEFAULT_SERVER_PAGE_VISIBLE', () => {
      const r = analyzeVisual(ruleInput({
        visibleText: 'Welcome to nginx! If you see this page...',
      }));
      expect(r.signals).toContain('DEFAULT_SERVER_PAGE_VISIBLE');
    });

    it('404 Not Found → ERROR_PAGE_VISIBLE, kategori error-page', () => {
      const r = analyzeVisual(ruleInput({
        title: '404 Not Found',
        visibleText: 'The requested URL was 404 Not Found on this server.',
      }));
      expect(r.signals).toContain('ERROR_PAGE_VISIBLE');
      expect(r.siteCategory).toBe('error-page');
      expect(r.riskLevel).toBe('MEDIUM');
    });

    it('500 Internal Server Error → ERROR_PAGE_VISIBLE', () => {
      const r = analyzeVisual(ruleInput({
        visibleText: '500 Internal Server Error - database error',
      }));
      expect(r.signals).toContain('ERROR_PAGE_VISIBLE');
    });

    it('boş sayfa → EMPTY_PAGE_DETECTED', () => {
      const r = analyzeVisual(ruleInput({ visibleText: 'Hi', linkCount: 1, inputCount: 0 }));
      expect(r.signals).toContain('EMPTY_PAGE_DETECTED');
      expect(r.siteCategory).toBe('empty-page');
      expect(r.analysis.isEmptyPage).toBe(true);
    });

    it('e-commerce keywords → kategori e-commerce', () => {
      const r = analyzeVisual(ruleInput({
        title: 'Online Store',
        visibleText: 'Sepete ekle. Ürün listesi. Fiyat: 100 TL. Checkout şimdi.',
        linkCount: 30,
      }));
      expect(r.siteCategory).toBe('e-commerce');
      expect(r.purposeSummary).toContain('e-ticaret');
    });

    it('corporate keywords → kategori corporate', () => {
      const r = analyzeVisual(ruleInput({
        title: 'Şirketimiz',
        visibleText: 'Hizmetlerimiz, hakkımızda, iletişim, kurumsal çözümler',
        linkCount: 20,
      }));
      expect(r.siteCategory).toBe('corporate');
    });

    it('blog keywords → kategori blog-news', () => {
      const r = analyzeVisual(ruleInput({
        title: 'My Blog',
        visibleText: 'Latest articles and news. Categories: tech, life. Author John.',
        linkCount: 25,
      }));
      expect(r.siteCategory).toBe('blog-news');
    });

    it('portfolio keywords → kategori portfolio-personal', () => {
      const r = analyzeVisual(ruleInput({
        title: 'Personal Portfolio',
        visibleText: 'My portfolio and projects. About me. Resume.',
        linkCount: 15,
      }));
      expect(r.siteCategory).toBe('portfolio-personal');
    });

    it('admin + login + error birlikte → risk HIGH', () => {
      const r = analyzeVisual(ruleInput({
        hasPasswordInput: true, formCount: 1,
        title: 'Admin Panel - 500 Internal Server Error',
        visibleText: 'admin dashboard 500 internal server error',
      }));
      expect(r.signals).toContain('LOGIN_PANEL_VISIBLE');
      expect(r.signals).toContain('ADMIN_PANEL_VISIBLE');
      expect(r.signals).toContain('ERROR_PAGE_VISIBLE');
      expect(r.riskLevel).toBe('HIGH');
    });

    it('Türkçe karakter varsa language tr', () => {
      const r = analyzeVisual(ruleInput({
        visibleText: 'Hoş geldiniz şirketimize. Ürünlerimize göz atın.',
      }));
      expect(r.language).toBe('tr');
    });

    it('TR/EN markeri yok → language null', () => {
      const r = analyzeVisual(ruleInput({ visibleText: 'short' }));
      expect(r.language).toBeNull();
    });

    it('purposeSummary kategori uyumlu Türkçe metin döner', () => {
      const r = analyzeVisual(ruleInput({
        title: '404 Not Found',
        visibleText: '404 Not Found - the page does not exist',
      }));
      expect(r.purposeSummary).toContain('hata');
    });

    it('detectedKeywords kategoriye göre dolar', () => {
      const r = analyzeVisual(ruleInput({
        title: 'Admin Login',
        visibleText: 'admin sign in dashboard',
        hasPasswordInput: true, formCount: 1,
      }));
      expect(r.analysis.detectedKeywords).toEqual(expect.arrayContaining(['admin', 'login']));
    });
  });

  // ─── 3. Orchestrator guards ───────────────────────────────────────────────

  describe('checkVisualAnalysis — guards', () => {
    it('IP asset → skipped NOT_DOMAIN, browser launch edilmez', async () => {
      const { launchMock } = setupPlaywright();
      const r = await checkVisualAnalysis({ asset: verifiedIp });
      expect(r.skipped).toBe(true);
      expect(r.skipReason).toBe('NOT_DOMAIN');
      expect(launchMock).not.toHaveBeenCalled();
    });

    it('PENDING asset → skipped NOT_VERIFIED, browser launch edilmez', async () => {
      const { launchMock } = setupPlaywright();
      const r = await checkVisualAnalysis({ asset: pendingDomain });
      expect(r.skipped).toBe(true);
      expect(r.skipReason).toBe('NOT_VERIFIED');
      expect(launchMock).not.toHaveBeenCalled();
    });

    it('URL başka domain → skipped INVALID_URL, browser launch edilmez', async () => {
      const { launchMock } = setupPlaywright();
      const r = await checkVisualAnalysis({ asset: verifiedDomain, url: 'https://evil.com/' });
      expect(r.skipped).toBe(true);
      expect(r.skipReason).toBe('INVALID_URL');
      expect(launchMock).not.toHaveBeenCalled();
    });

    it('aynı domain URL kabul edilir', async () => {
      setupPlaywright();
      const r = await checkVisualAnalysis({ asset: verifiedDomain, url: 'https://example.com/x' });
      expect(r.skipped).toBe(false);
    });
  });

  // ─── 4. Orchestrator — happy path ─────────────────────────────────────────

  describe('checkVisualAnalysis — happy path', () => {
    it('başarılı analiz: status, finalUrl, screenshot, DOM, rule signals dolu', async () => {
      setupPlaywright({ gotoStatus: 200, finalUrl: 'https://example.com/' });
      (captureScreenshot as jest.Mock).mockResolvedValue(
        mockedScreenshot({ path: '/tmp/visual.png', hash: 'shot-hash', width: 1440, height: 900 }),
      );
      (extractDom as jest.Mock).mockResolvedValue(
        mockedDom({ title: 'Example Corp', visibleText: 'Hizmetlerimiz hakkında bilgi', linkCount: 20 }),
      );

      const r = await checkVisualAnalysis({ asset: verifiedDomain });

      expect(r.skipped).toBe(false);
      expect(r.statusCode).toBe(200);
      expect(r.finalUrl).toBe('https://example.com/');
      expect(r.screenshotPath).toBe('/tmp/visual.png');
      expect(r.screenshotHash).toBe('shot-hash');
      expect(r.title).toBe('Example Corp');
      expect(r.siteCategory).toBeDefined();
      expect(r.riskLevel).toBeDefined();
      expect(typeof r.checkedAt).toBe('string');
    });

    it('default URL verilmezse https://value denenir', async () => {
      const { pageGoto } = setupPlaywright();
      await checkVisualAnalysis({ asset: verifiedDomain });
      expect(pageGoto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    });

    it('browser her durumda kapatılır (happy path)', async () => {
      const { browserClose } = setupPlaywright();
      await checkVisualAnalysis({ asset: verifiedDomain });
      expect(browserClose).toHaveBeenCalled();
    });
  });

  // ─── 5. Orchestrator — error paths ────────────────────────────────────────

  describe('checkVisualAnalysis — error handling', () => {
    it('page.goto throw → PAGE_LOAD_FAILED skipped + error message', async () => {
      setupPlaywright({ gotoThrow: new Error('net::ERR_CONNECTION_REFUSED') });
      const r = await checkVisualAnalysis({ asset: verifiedDomain });
      expect(r.skipped).toBe(true);
      expect(r.skipReason).toBe('PAGE_LOAD_FAILED');
      expect(r.error).toContain('ERR_CONNECTION_REFUSED');
    });

    it('https fail → http fallback denenir', async () => {
      let attempts = 0;
      const { launchMock } = setupPlaywright();
      const fakeBrowser = await (launchMock.mock.results[0]?.value ?? launchMock());
      const fakeContext = await fakeBrowser.newContext();
      const fakePage = await fakeContext.newPage();
      fakePage.goto = jest.fn().mockImplementation((url: string) => {
        attempts++;
        if (url.startsWith('https://')) return Promise.reject(new Error('https failed'));
        return Promise.resolve({ status: () => 200 });
      });

      const r = await checkVisualAnalysis({ asset: verifiedDomain });
      expect(attempts).toBeGreaterThanOrEqual(2);
      expect(r.skipped).toBe(false);
    });

    it('chromium.launch throw → result PAGE_LOAD_FAILED + error, scan patlamaz', async () => {
      (chromium.launch as jest.Mock).mockReset();
      (chromium.launch as jest.Mock).mockRejectedValue(new Error('browser binary missing'));

      const r = await checkVisualAnalysis({ asset: verifiedDomain });
      expect(r.skipped).toBe(true);
      expect(r.skipReason).toBe('PAGE_LOAD_FAILED');
      expect(r.error).toContain('browser binary missing');
    });

    it('screenshot fail ama DOM başarılı → result döner, error dolu', async () => {
      setupPlaywright();
      (captureScreenshot as jest.Mock).mockResolvedValue(
        mockedScreenshot({ path: null, hash: null, width: null, height: null, error: 'SCREENSHOT_FAILED' }),
      );

      const r = await checkVisualAnalysis({ asset: verifiedDomain });
      expect(r.skipped).toBe(false);
      expect(r.screenshotPath).toBeNull();
      expect(r.error).toBe('SCREENSHOT_FAILED');
      expect(r.title).toBeDefined();   // DOM extraction yine çalıştı
    });

    it('DOM fail ama screenshot başarılı → result döner, error dolu', async () => {
      setupPlaywright();
      (extractDom as jest.Mock).mockResolvedValue(
        mockedDom({ title: null, visibleText: null, error: 'DOM_EXTRACTION_FAILED' }),
      );

      const r = await checkVisualAnalysis({ asset: verifiedDomain });
      expect(r.error).toBe('DOM_EXTRACTION_FAILED');
      expect(r.screenshotPath).toBe('/tmp/visual.png');
    });

    it('browser launch sonrası throw → finally bloğunda browser kapatılır', async () => {
      const { browserClose } = setupPlaywright({ gotoThrow: new Error('boom') });
      await checkVisualAnalysis({ asset: verifiedDomain });
      expect(browserClose).toHaveBeenCalled();
    });
  });

  // ─── 6b. AI visual analyzer integration ───────────────────────────────────

  describe('AI visual analyzer integration', () => {
    const mockedAiSuccess = {
      enabled: true,
      provider: 'ollama',
      model: 'llava:latest',
      sitePurpose: 'Kurumsal sayfa',
      siteCategory: 'corporate',
      visualSummary: 'Logo ve menü',
      visibleElements: ['logo'],
      securitySignals: [],
      riskLevel: 'LOW',
      securityCommentary: 'Manuel doğrulama',
      recommendations: [],
      manualVerificationNeeded: false,
      checkedAt: 'ai-iso',
    };

    it('ENABLE_VISUAL_AI=false → analyzeScreenshotWithAi çağrılmaz, aiVisualAnalysis null', async () => {
      delete process.env.ENABLE_VISUAL_AI;
      setupPlaywright();

      const r = await checkVisualAnalysis({ asset: verifiedDomain });
      expect(analyzeScreenshotWithAi as jest.Mock).not.toHaveBeenCalled();
      expect(r.aiVisualAnalysis).toBeNull();
    });

    it('ENABLE_VISUAL_AI=true + screenshotPath varsa AI çağrılır ve sonuç set edilir', async () => {
      process.env.ENABLE_VISUAL_AI = 'true';
      setupPlaywright();
      (analyzeScreenshotWithAi as jest.Mock).mockResolvedValue(mockedAiSuccess);

      const r = await checkVisualAnalysis({ asset: verifiedDomain });
      expect(analyzeScreenshotWithAi as jest.Mock).toHaveBeenCalledTimes(1);
      const call = (analyzeScreenshotWithAi as jest.Mock).mock.calls[0][0];
      expect(call.screenshotPath).toBe('/tmp/visual.png');
      expect(call.provider).toBe('ollama');
      expect(call.model).toBe('llava:latest');
      expect(call.pageContext.title).toBe('Example');
      expect(r.aiVisualAnalysis).toEqual(mockedAiSuccess);
    });

    it('ENABLE_VISUAL_AI=true ama screenshot fail → AI çağrılmaz, aiVisualAnalysis null', async () => {
      process.env.ENABLE_VISUAL_AI = 'true';
      setupPlaywright();
      (captureScreenshot as jest.Mock).mockResolvedValue(
        mockedScreenshot({ path: null, hash: null, width: null, height: null, error: 'SCREENSHOT_FAILED' }),
      );

      const r = await checkVisualAnalysis({ asset: verifiedDomain });
      expect(analyzeScreenshotWithAi as jest.Mock).not.toHaveBeenCalled();
      expect(r.aiVisualAnalysis).toBeNull();
      expect(r.skipped).toBe(false);
    });

    it('AI analyzer error sonucu döndürse bile check skipped olmaz, aiVisualAnalysis.error dolu', async () => {
      process.env.ENABLE_VISUAL_AI = 'true';
      setupPlaywright();
      (analyzeScreenshotWithAi as jest.Mock).mockResolvedValue({
        ...mockedAiSuccess,
        sitePurpose: null,
        siteCategory: null,
        visualSummary: null,
        riskLevel: null,
        error: 'AI_TIMEOUT',
        manualVerificationNeeded: true,
      });

      const r = await checkVisualAnalysis({ asset: verifiedDomain });
      expect(r.skipped).toBe(false);
      expect(r.aiVisualAnalysis?.error).toBe('AI_TIMEOUT');
    });

    it('AI analyzer beklenmedik throw ederse check patlamaz, error dolu', async () => {
      process.env.ENABLE_VISUAL_AI = 'true';
      setupPlaywright();
      (analyzeScreenshotWithAi as jest.Mock).mockRejectedValue(new Error('boom in ai'));

      const r = await checkVisualAnalysis({ asset: verifiedDomain });
      expect(r.skipped).toBe(false);
      expect(r.aiVisualAnalysis?.error).toMatch(/AI_UNEXPECTED_ERROR/);
    });

    it('skipped result için aiVisualAnalysis null (NOT_DOMAIN)', async () => {
      process.env.ENABLE_VISUAL_AI = 'true';
      setupPlaywright();
      const r = await checkVisualAnalysis({ asset: verifiedIp });
      expect(r.skipped).toBe(true);
      expect(r.aiVisualAnalysis).toBeNull();
    });
  });

  // ─── 6. screenshotDir default ─────────────────────────────────────────────

  describe('screenshotDir', () => {
    it('default ile os.tmpdir() altına yazar', async () => {
      setupPlaywright();
      await checkVisualAnalysis({ asset: verifiedDomain });
      const call = (captureScreenshot as jest.Mock).mock.calls[0][0];
      expect(call.screenshotDir).toContain(os.tmpdir());
    });

    it('explicit screenshotDir geçirilirse onu kullanır', async () => {
      setupPlaywright();
      const customDir = path.join(os.tmpdir(), 'asm-custom-test');
      await checkVisualAnalysis({ asset: verifiedDomain, screenshotDir: customDir });
      const call = (captureScreenshot as jest.Mock).mock.calls[0][0];
      expect(call.screenshotDir).toBe(customDir);
    });
  });
});
