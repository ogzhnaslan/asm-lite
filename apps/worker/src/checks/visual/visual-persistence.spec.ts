import { persistVisualAnalysisRun, VISUAL_PERSISTENCE_LIMITS } from './visual-persistence';
import type { VisualAnalysisResult } from './visual-types';

const mockPrisma = {
  visualAnalysisRun: {
    create: jest.fn().mockResolvedValue({ id: 'run-1' }),
  },
};

function makeResult(overrides: Partial<VisualAnalysisResult> = {}): VisualAnalysisResult {
  return {
    enabled: true,
    skipped: false,
    assetValue: 'example.com',
    url: 'https://example.com',
    finalUrl: 'https://example.com/',
    statusCode: 200,
    screenshotPath: '/tmp/asm-visual/visual_example.com_1.png',
    screenshotHash: 'a'.repeat(64),
    screenshotWidth: 1440,
    screenshotHeight: 900,
    title: 'Example Corp',
    metaDescription: 'Corporate site',
    h1Texts: ['Welcome', 'About'],
    visibleText: 'Hizmetlerimiz hakkında bilgi.',
    visibleTextHash: 'b'.repeat(64),
    siteCategory: 'corporate',
    purposeSummary: 'Bu site kurumsal tanıtım amacıyla hazırlanmış görünüyor.',
    language: 'tr',
    signals: [],
    riskLevel: 'LOW',
    analysis: {
      hasLoginForm: false, hasPasswordInput: false, hasAdminHints: false,
      hasDefaultServerPage: false, hasErrorPage: false, isEmptyPage: false,
      linkCount: 10, formCount: 1, inputCount: 2, buttonCount: 3,
      detectedKeywords: ['corporate'],
    },
    aiVisualAnalysis: null,
    checkedAt: '2026-05-25T13:00:00.000Z',
    ...overrides,
  };
}

describe('persistVisualAnalysisRun', () => {
  beforeEach(() => jest.clearAllMocks());

  it('full visualResult tüm alanları DB create çağrısına doğru map\'ler', async () => {
    const result = makeResult();
    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });

    expect(mockPrisma.visualAnalysisRun.create).toHaveBeenCalledTimes(1);
    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;

    expect(data.assetId).toBe('asset-1');
    expect(data.url).toBe('https://example.com');
    expect(data.finalUrl).toBe('https://example.com/');
    expect(data.statusCode).toBe(200);
    expect(data.screenshotPath).toBe('/tmp/asm-visual/visual_example.com_1.png');
    expect(data.screenshotHash).toBe(result.screenshotHash);
    expect(data.screenshotWidth).toBe(1440);
    expect(data.screenshotHeight).toBe(900);
    expect(data.title).toBe('Example Corp');
    expect(data.metaDescription).toBe('Corporate site');
    expect(data.h1TextsJson).toEqual(['Welcome', 'About']);
    expect(data.visibleText).toBe('Hizmetlerimiz hakkında bilgi.');
    expect(data.visibleTextHash).toBe(result.visibleTextHash);
    expect(data.siteCategory).toBe('corporate');
    expect(data.purposeSummary).toContain('kurumsal');
    expect(data.language).toBe('tr');
    expect(data.signalsJson).toEqual([]);
    expect(data.riskLevel).toBe('LOW');
    expect(data.error).toBeNull();
  });

  it('signals array signalsJson içinde korunur', async () => {
    const result = makeResult({
      signals: ['LOGIN_PANEL_VISIBLE', 'ADMIN_PANEL_VISIBLE'],
      riskLevel: 'MEDIUM',
    });
    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });

    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.signalsJson).toEqual(['LOGIN_PANEL_VISIBLE', 'ADMIN_PANEL_VISIBLE']);
    expect(data.riskLevel).toBe('MEDIUM');
  });

  it('analysisJson içine analysis + skipped/skipReason/error/checkedAt birlikte gider', async () => {
    const result = makeResult({
      signals: ['ADMIN_PANEL_VISIBLE'],
      analysis: {
        hasLoginForm: false, hasPasswordInput: false, hasAdminHints: true,
        hasDefaultServerPage: false, hasErrorPage: false, isEmptyPage: false,
        linkCount: 5, formCount: 1, inputCount: 0, buttonCount: 2,
        detectedKeywords: ['admin'],
      },
    });
    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });

    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: { analysisJson: Record<string, unknown> } }).data;
    expect(data.analysisJson).toEqual(expect.objectContaining({
      hasAdminHints: true,
      detectedKeywords: ['admin'],
      skipped: false,
      skipReason: null,
      error: null,
      checkedAt: '2026-05-25T13:00:00.000Z',
    }));
  });

  it('visibleText 8000 karakter üstü ise truncate edilir', async () => {
    const longText = 'x'.repeat(20_000);
    const result = makeResult({ visibleText: longText });

    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });

    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: { visibleText: string } }).data;
    expect(data.visibleText).toHaveLength(VISUAL_PERSISTENCE_LIMITS.VISIBLE_TEXT_DB_MAX);
    expect(data.visibleText).toBe('x'.repeat(VISUAL_PERSISTENCE_LIMITS.VISIBLE_TEXT_DB_MAX));
  });

  it('visibleText kısa ise olduğu gibi yazılır', async () => {
    const result = makeResult({ visibleText: 'short' });
    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });
    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: { visibleText: string } }).data;
    expect(data.visibleText).toBe('short');
  });

  it('visibleText null/undefined ise null olarak yazılır', async () => {
    const result = makeResult({ visibleText: null });
    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });
    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: { visibleText: string | null } }).data;
    expect(data.visibleText).toBeNull();
  });

  it('skipped result yine de kayıt yazar, analysisJson içinde skipReason/error dolu', async () => {
    const result = makeResult({
      skipped: true,
      skipReason: 'PAGE_LOAD_FAILED',
      url: 'https://example.com',
      finalUrl: null,
      statusCode: null,
      screenshotPath: null,
      screenshotHash: null,
      screenshotWidth: null,
      screenshotHeight: null,
      title: null,
      metaDescription: null,
      h1Texts: [],
      visibleText: null,
      visibleTextHash: null,
      siteCategory: null,
      purposeSummary: null,
      language: null,
      signals: [],
      riskLevel: null,
      error: 'ERR_CONNECTION_REFUSED',
    });

    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });

    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.screenshotPath).toBeNull();
    expect(data.statusCode).toBeNull();
    expect(data.error).toBe('ERR_CONNECTION_REFUSED');
    expect((data.analysisJson as Record<string, unknown>).skipped).toBe(true);
    expect((data.analysisJson as Record<string, unknown>).skipReason).toBe('PAGE_LOAD_FAILED');
    expect((data.analysisJson as Record<string, unknown>).error).toBe('ERR_CONNECTION_REFUSED');
  });

  it('url null ise empty string olarak yazılır (model NOT NULL)', async () => {
    const result = makeResult({ url: null });
    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });
    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: { url: string } }).data;
    expect(data.url).toBe('');
  });

  it('h1Texts boş dizi h1TextsJson içinde korunur', async () => {
    const result = makeResult({ h1Texts: [] });
    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });
    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: { h1TextsJson: unknown } }).data;
    expect(data.h1TextsJson).toEqual([]);
  });

  // ─── AI visual analysis field ────────────────────────────────────────────

  it('aiVisualAnalysis null ise analysisJson içine null olarak yazılır', async () => {
    const result = makeResult({ aiVisualAnalysis: null });
    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });
    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: { analysisJson: Record<string, unknown> } }).data;
    expect(data.analysisJson.aiVisualAnalysis).toBeNull();
  });

  it('aiVisualAnalysis dolu sonuç analysisJson içine eklenir', async () => {
    const ai = {
      enabled: true,
      provider: 'ollama',
      model: 'llava:latest',
      sitePurpose: 'Kurumsal',
      siteCategory: 'corporate' as const,
      visualSummary: 'Logo ve menü',
      visibleElements: ['logo', 'menu'],
      securitySignals: [{ type: 'LOGIN_PANEL_VISIBLE', confidence: 0.6, reason: 'form var' }],
      riskLevel: 'LOW' as const,
      securityCommentary: 'Manuel doğrulama',
      recommendations: ['HTTPS kullan'],
      manualVerificationNeeded: true,
      checkedAt: '2026-05-25T13:01:00.000Z',
    };
    const result = makeResult({ aiVisualAnalysis: ai });
    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });
    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: { analysisJson: Record<string, unknown> } }).data;
    expect(data.analysisJson.aiVisualAnalysis).toEqual(ai);
  });

  it('aiVisualAnalysis.rawText 4000 üstüyse truncate edilir', async () => {
    const longRaw = 'x'.repeat(10_000);
    const ai = {
      enabled: true,
      provider: 'ollama',
      model: 'llava:latest',
      sitePurpose: null,
      siteCategory: null,
      visualSummary: null,
      visibleElements: [],
      securitySignals: [],
      riskLevel: null,
      securityCommentary: null,
      recommendations: [],
      manualVerificationNeeded: true,
      rawText: longRaw,
      error: 'AI_JSON_PARSE_FAILED',
      checkedAt: '2026-05-25T13:01:00.000Z',
    };
    const result = makeResult({ aiVisualAnalysis: ai });
    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });

    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: { analysisJson: Record<string, unknown> } }).data;
    const persistedAi = data.analysisJson.aiVisualAnalysis as { rawText: string; error: string };
    expect(persistedAi.rawText).toHaveLength(VISUAL_PERSISTENCE_LIMITS.AI_RAW_TEXT_DB_MAX);
    expect(persistedAi.error).toBe('AI_JSON_PARSE_FAILED');
  });

  it('aiVisualAnalysis.rawText kısaysa olduğu gibi yazılır', async () => {
    const ai = {
      enabled: true,
      provider: 'ollama',
      model: 'llava:latest',
      sitePurpose: 'x',
      siteCategory: null,
      visualSummary: null,
      visibleElements: [],
      securitySignals: [],
      riskLevel: null,
      securityCommentary: null,
      recommendations: [],
      manualVerificationNeeded: false,
      rawText: 'short raw',
      checkedAt: '2026-05-25T13:01:00.000Z',
    };
    const result = makeResult({ aiVisualAnalysis: ai });
    await persistVisualAnalysisRun(mockPrisma as any, { assetId: 'asset-1', visualResult: result });
    const data = (mockPrisma.visualAnalysisRun.create.mock.calls[0]![0] as { data: { analysisJson: Record<string, unknown> } }).data;
    expect((data.analysisJson.aiVisualAnalysis as { rawText: string }).rawText).toBe('short raw');
  });
});
