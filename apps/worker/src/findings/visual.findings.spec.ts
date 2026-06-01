import { processVisualFindings, buildVisualFindingKey } from './visual.findings';
import type { VisualAnalysisResult } from '../checks/visual/visual-types';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function makeResult(overrides: Partial<VisualAnalysisResult> = {}): VisualAnalysisResult {
  return {
    enabled: true,
    skipped: false,
    assetValue: 'example.com',
    url: 'https://example.com',
    finalUrl: 'https://example.com/',
    statusCode: 200,
    screenshotPath: '/tmp/visual_example_1.png',
    screenshotHash: 'a'.repeat(64),
    screenshotWidth: 1440,
    screenshotHeight: 900,
    title: 'Example',
    metaDescription: null,
    h1Texts: [],
    visibleText: 'sample',
    visibleTextHash: 'b'.repeat(64),
    siteCategory: 'corporate',
    purposeSummary: 'Test',
    language: 'tr',
    signals: [],
    riskLevel: 'LOW',
    analysis: {
      hasLoginForm: false, hasPasswordInput: false, hasAdminHints: false,
      hasDefaultServerPage: false, hasErrorPage: false, isEmptyPage: false,
      linkCount: 5, formCount: 0, inputCount: 0, buttonCount: 0,
      detectedKeywords: [],
    },
    aiVisualAnalysis: null,
    checkedAt: '2026-05-25T13:00:00.000Z',
    ...overrides,
  };
}

const ALL_SIGNALS = [
  'LOGIN_PANEL_VISIBLE',
  'ADMIN_PANEL_VISIBLE',
  'DEFAULT_SERVER_PAGE_VISIBLE',
  'ERROR_PAGE_VISIBLE',
  'EMPTY_PAGE_DETECTED',
];

function findUpsert(signal: string) {
  return (mockPrisma.finding.upsert.mock.calls as Array<[{ create: { type: string } }]>)
    .find((c) => c[0].create.type === signal)?.[0] as
    | { create: { severity: string; aiScore: number; key: string; dataJson: Record<string, unknown>; aiWhyJson: Record<string, unknown> } }
    | undefined;
}

function findResolveCount(): number {
  return mockPrisma.finding.updateMany.mock.calls.length;
}

describe('processVisualFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── Guards ─────────────────────────────────────────────────────────────

  it('skipped result → DB çağrısı yok', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ skipped: true, skipReason: 'NOT_VERIFIED' }),
    });
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it('error result (CHECK_CRASHED) → DB çağrısı yok (eski findingler dokunulmaz)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ error: 'CHECK_CRASHED' }),
    });
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it('error PAGE_LOAD_FAILED → DB çağrısı yok', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ skipped: true, skipReason: 'PAGE_LOAD_FAILED', error: 'ERR_CONNECTION_REFUSED' }),
    });
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── Empty signals → tümü resolve ─────────────────────────────────────

  it('signal yoksa 5 sinyalin hepsi için resolve çağrılır (önceki finding\'ler kapanır)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: [] }),
    });
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    // 5 sinyal resolve + 1 VISUAL_CHANGE resolve (baseline yok → değişiklik üretilmez)
    expect(findResolveCount()).toBe(6);
    // Her sinyal key formatı doğru mu
    const keys = (mockPrisma.finding.updateMany.mock.calls as Array<[{ where: { key: string } }]>).map((c) => c[0].where.key);
    expect(keys).toEqual(expect.arrayContaining(
      ALL_SIGNALS.map((s) => `VISUAL:${s}:example.com`),
    ));
  });

  // ─── Severity mapping ──────────────────────────────────────────────────

  it('ADMIN_PANEL_VISIBLE tek başına → MEDIUM (65)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['ADMIN_PANEL_VISIBLE'], riskLevel: 'MEDIUM' }),
    });
    const adminFinding = findUpsert('ADMIN_PANEL_VISIBLE');
    expect(adminFinding).toBeDefined();
    expect(adminFinding!.create.severity).toBe('MEDIUM');
    expect(adminFinding!.create.aiScore).toBe(65);
    // Diğer 4 sinyal resolve + 1 VISUAL_CHANGE resolve (baseline yok)
    expect(findResolveCount()).toBe(5);
  });

  it('ADMIN + LOGIN birlikte → ADMIN HIGH (85), LOGIN LOW (35)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['ADMIN_PANEL_VISIBLE', 'LOGIN_PANEL_VISIBLE'] }),
    });
    const admin = findUpsert('ADMIN_PANEL_VISIBLE');
    const login = findUpsert('LOGIN_PANEL_VISIBLE');
    expect(admin!.create.severity).toBe('HIGH');
    expect(admin!.create.aiScore).toBe(85);
    expect(login!.create.severity).toBe('LOW');
    expect(login!.create.aiScore).toBe(35);
  });

  it('ADMIN + ERROR birlikte → ADMIN HIGH (85)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['ADMIN_PANEL_VISIBLE', 'ERROR_PAGE_VISIBLE'] }),
    });
    expect(findUpsert('ADMIN_PANEL_VISIBLE')!.create.severity).toBe('HIGH');
    expect(findUpsert('ERROR_PAGE_VISIBLE')!.create.severity).toBe('MEDIUM');
  });

  it('LOGIN_PANEL_VISIBLE tek başına → LOW (35)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['LOGIN_PANEL_VISIBLE'] }),
    });
    const login = findUpsert('LOGIN_PANEL_VISIBLE');
    expect(login!.create.severity).toBe('LOW');
    expect(login!.create.aiScore).toBe(35);
  });

  it('DEFAULT_SERVER_PAGE_VISIBLE → MEDIUM (65)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['DEFAULT_SERVER_PAGE_VISIBLE'] }),
    });
    expect(findUpsert('DEFAULT_SERVER_PAGE_VISIBLE')!.create.severity).toBe('MEDIUM');
  });

  it('ERROR_PAGE_VISIBLE → MEDIUM (65)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['ERROR_PAGE_VISIBLE'] }),
    });
    expect(findUpsert('ERROR_PAGE_VISIBLE')!.create.severity).toBe('MEDIUM');
  });

  it('EMPTY_PAGE_DETECTED → LOW (35)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['EMPTY_PAGE_DETECTED'] }),
    });
    expect(findUpsert('EMPTY_PAGE_DETECTED')!.create.severity).toBe('LOW');
  });

  // ─── Key formatı ────────────────────────────────────────────────────────

  it('finding key formatı VISUAL:<signal>:<asset.value>', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['ADMIN_PANEL_VISIBLE'] }),
    });
    expect(findUpsert('ADMIN_PANEL_VISIBLE')!.create.key).toBe('VISUAL:ADMIN_PANEL_VISIBLE:example.com');
  });

  it('buildVisualFindingKey helper export edilir', () => {
    expect(buildVisualFindingKey('ADMIN_PANEL_VISIBLE', 'foo.bar')).toBe('VISUAL:ADMIN_PANEL_VISIBLE:foo.bar');
  });

  // ─── dataJson içeriği ──────────────────────────────────────────────────

  it('dataJson visualRunId, url, signals, screenshot meta + analysis taşır', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({
        signals: ['ADMIN_PANEL_VISIBLE'],
        title: 'Admin Dashboard',
        screenshotHash: 'h'.repeat(64),
      }),
      visualRunId: 'visualrun-42',
    });
    const data = findUpsert('ADMIN_PANEL_VISIBLE')!.create.dataJson;
    expect(data).toMatchObject({
      visualRunId: 'visualrun-42',
      url: 'https://example.com',
      title: 'Admin Dashboard',
      signal: 'ADMIN_PANEL_VISIBLE',
      signals: ['ADMIN_PANEL_VISIBLE'],
      screenshotUrlHint: '/assets/asset-1/visual-analysis/visualrun-42/screenshot',
      screenshotHash: 'h'.repeat(64),
      screenshotWidth: 1440,
      screenshotHeight: 900,
    });
    expect(data.analysis).toBeDefined();
  });

  it('visualRunId yoksa screenshotUrlHint null', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['ADMIN_PANEL_VISIBLE'] }),
      // visualRunId vermiyoruz
    });
    const data = findUpsert('ADMIN_PANEL_VISIBLE')!.create.dataJson;
    expect(data.screenshotUrlHint).toBeNull();
    expect(data.visualRunId).toBeNull();
  });

  // ─── aiWhyJson Türkçe ──────────────────────────────────────────────────

  it('aiWhyJson Türkçe summary + impact + recommendations içerir', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['ADMIN_PANEL_VISIBLE'] }),
    });
    const aiWhy = findUpsert('ADMIN_PANEL_VISIBLE')!.create.aiWhyJson as {
      summary: string; impact: string; recommendations: string[]; signals: string[];
    };
    expect(aiWhy.summary).toContain('admin');
    expect(aiWhy.impact).toContain('manuel doğrulama');
    expect(aiWhy.recommendations.length).toBeGreaterThan(0);
    expect(aiWhy.signals).toEqual(['ADMIN_PANEL_VISIBLE']);
  });

  // ─── Idempotency / reopen ──────────────────────────────────────────────

  it('upsert "where assetId_key" ile çağrılır → reopen (update.resolvedAt=null)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['ADMIN_PANEL_VISIBLE'] }),
    });
    const call = (mockPrisma.finding.upsert.mock.calls[0]![0] as {
      where: unknown; update: { resolvedAt: null; isNew: boolean };
    });
    expect(call.where).toEqual({ assetId_key: { assetId: 'asset-1', key: 'VISUAL:ADMIN_PANEL_VISIBLE:example.com' } });
    expect(call.update.resolvedAt).toBeNull();
  });

  // ─── Per-signal error isolation ────────────────────────────────────────

  it('tek sinyal upsert hatası diğer sinyalleri engellemez', async () => {
    mockPrisma.finding.upsert
      .mockRejectedValueOnce(new Error('DB error on first'))
      .mockResolvedValueOnce({});

    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: ['ADMIN_PANEL_VISIBLE', 'LOGIN_PANEL_VISIBLE'] }),
    });

    // 2 upsert denendi (admin + login), 1'i fail oldu ama diğeri devam etti
    expect(mockPrisma.finding.upsert).toHaveBeenCalledTimes(2);
  });

  // ─── 3+ sinyal birlikte ────────────────────────────────────────────────

  it('5 sinyalin 3\'ü varsa 3 upsert + 2 resolve', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({
        signals: ['ADMIN_PANEL_VISIBLE', 'LOGIN_PANEL_VISIBLE', 'ERROR_PAGE_VISIBLE'],
      }),
    });
    expect(mockPrisma.finding.upsert).toHaveBeenCalledTimes(3);
    // DEFAULT_SERVER_PAGE + EMPTY + VISUAL_CHANGE (baseline yok) = 3 resolve
    expect(findResolveCount()).toBe(3);
  });

  // ─── VISUAL_CHANGE_DETECTED ────────────────────────────────────────────────

  function findChangeUpsert() {
    return (mockPrisma.finding.upsert.mock.calls as Array<[{ create: { type: string } }]>)
      .find((c) => c[0].create.type === 'VISUAL_CHANGE_DETECTED')?.[0] as
      | { create: { severity: string; aiScore: number; key: string; dataJson: Record<string, unknown> } }
      | undefined;
  }

  it('baseline yoksa (previous=null) → VISUAL_CHANGE upsert yok, resolve var', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: [] }),
      previous: null,
    });
    expect(findChangeUpsert()).toBeUndefined();
    const keys = (mockPrisma.finding.updateMany.mock.calls as Array<[{ where: { key: string } }]>).map((c) => c[0].where.key);
    expect(keys).toContain('VISUAL_CHANGE:example.com');
  });

  it('hash aynıysa değişiklik yok → VISUAL_CHANGE resolve', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: [], screenshotHash: 'x'.repeat(64), visibleTextHash: 'y'.repeat(64) }),
      previous: { screenshotHash: 'x'.repeat(64), visibleTextHash: 'y'.repeat(64) },
    });
    expect(findChangeUpsert()).toBeUndefined();
  });

  it('hem screenshot hem metin değişti → MEDIUM (50)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: [], screenshotHash: 'new1'.repeat(16), visibleTextHash: 'new2'.repeat(16) }),
      previous: { screenshotHash: 'old1'.repeat(16), visibleTextHash: 'old2'.repeat(16) },
    });
    const change = findChangeUpsert();
    expect(change).toBeDefined();
    expect(change!.create.severity).toBe('MEDIUM');
    expect(change!.create.aiScore).toBe(50);
    expect(change!.create.key).toBe('VISUAL_CHANGE:example.com');
    expect(change!.create.dataJson).toMatchObject({ changedScreenshot: true, changedText: true });
  });

  it('sadece metin değişti → LOW (30)', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: [], screenshotHash: 'same'.repeat(16), visibleTextHash: 'newtext'.repeat(8) + 'aaaaaaaa' }),
      previous: { screenshotHash: 'same'.repeat(16), visibleTextHash: 'oldtext'.repeat(8) + 'aaaaaaaa' },
    });
    const change = findChangeUpsert();
    expect(change).toBeDefined();
    expect(change!.create.severity).toBe('LOW');
    expect(change!.create.aiScore).toBe(30);
    expect(change!.create.dataJson).toMatchObject({ changedScreenshot: false, changedText: true });
  });

  it('previous skipped/error ise baseline sayılmaz → upsert yok', async () => {
    await processVisualFindings(mockPrisma as any, {
      asset, scanRunId,
      visualResult: makeResult({ signals: [], screenshotHash: 'new'.repeat(20) + 'aaaa', visibleTextHash: 'new'.repeat(20) + 'bbbb' }),
      previous: { skipped: true, screenshotHash: null, visibleTextHash: null },
    });
    expect(findChangeUpsert()).toBeUndefined();
  });
});
