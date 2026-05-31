// AI Visual Analyzer unit testleri.
//
// Strateji:
// - fs.promises.readFile global mock'lanır (gerçek dosya I/O yok).
// - global.fetch mock'lanır (gerçek Ollama çağrısı yok).
// - Provider Ollama; happy path, code-fence, invalid JSON, timeout, network
//   hatası, defensive parse, image read hatası — hepsi kapsanır.

import {
  analyzeScreenshotWithAi,
  stripJsonCodeFence,
  safeJsonParse,
  buildDisabledAiResult,
  buildPrompt,
} from './ai-visual-analyzer';
import type { AiVisualPageContext } from './visual-types';

import { promises as fsPromises } from 'node:fs';

// ─── fs mock ──────────────────────────────────────────────────────────────────

jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: jest.fn(),
    },
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<AiVisualPageContext> = {}): AiVisualPageContext {
  return {
    url: 'https://example.com',
    finalUrl: 'https://example.com/',
    title: 'Example',
    metaDescription: null,
    h1Texts: ['Hello'],
    visibleTextSample: 'Some visible text',
    ruleBasedCategory: 'corporate',
    ruleBasedSignals: [],
    ruleBasedRiskLevel: 'LOW',
    ...overrides,
  };
}

function ollamaJsonResponse(body: object) {
  return JSON.stringify({ response: JSON.stringify(body) });
}

function mockFetchOnce(text: string, ok = true, status = 200) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status,
    json: async () => JSON.parse(text),
  });
}

function mockFetchReject(err: Error) {
  (global.fetch as jest.Mock).mockRejectedValueOnce(err);
}

beforeEach(() => {
  jest.clearAllMocks();
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  (fsPromises.readFile as jest.Mock).mockResolvedValue(Buffer.from('fake-image-bytes'));
});

// ─── Pure helpers ─────────────────────────────────────────────────────────────

describe('stripJsonCodeFence', () => {
  it('plain JSON olduğu gibi döner (trimmed)', () => {
    expect(stripJsonCodeFence('{"a":1}')).toBe('{"a":1}');
    expect(stripJsonCodeFence('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('```json fence içini söker', () => {
    const src = '```json\n{"a":1}\n```';
    expect(stripJsonCodeFence(src)).toBe('{"a":1}');
  });

  it('etiketsiz ``` fence içini söker', () => {
    const src = '```\n{"a":1}\n```';
    expect(stripJsonCodeFence(src)).toBe('{"a":1}');
  });

  it('boş string güvenli işlenir', () => {
    expect(stripJsonCodeFence('')).toBe('');
  });
});

describe('safeJsonParse', () => {
  it('valid JSON parse eder', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('invalid JSON null döner (throw etmez)', () => {
    expect(safeJsonParse('not json')).toBeNull();
    expect(safeJsonParse('{a:1}')).toBeNull();
  });

  it('boş string null döner', () => {
    expect(safeJsonParse('')).toBeNull();
  });
});

describe('buildPrompt', () => {
  it('beklenen JSON şemasını ve kuralları içerir', () => {
    const prompt = buildPrompt(makeContext({ title: 'My Site' }));
    expect(prompt).toContain('sitePurpose');
    expect(prompt).toContain('siteCategory');
    expect(prompt).toContain('LOGIN_PANEL_VISIBLE');
    expect(prompt).toContain('manuel doğrulama');
    expect(prompt).toContain('My Site');
  });
});

describe('buildDisabledAiResult', () => {
  it('güvenli, boş, enabled=false sonuç üretir', () => {
    const r = buildDisabledAiResult();
    expect(r.enabled).toBe(false);
    expect(r.provider).toBeNull();
    expect(r.model).toBeNull();
    expect(r.siteCategory).toBeNull();
    expect(r.securitySignals).toEqual([]);
    expect(r.recommendations).toEqual([]);
    expect(r.manualVerificationNeeded).toBe(false);
    expect(typeof r.checkedAt).toBe('string');
  });
});

// ─── analyzeScreenshotWithAi ──────────────────────────────────────────────────

describe('analyzeScreenshotWithAi', () => {
  const baseInput = {
    pageContext: makeContext(),
    provider: 'ollama' as const,
    baseUrl: 'http://localhost:11434',
    model: 'llava:latest',
    timeoutMs: 5_000,
  };

  it('screenshotPath null ise fetch çağrılmaz, NO_SCREENSHOT döner', async () => {
    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: null });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r.enabled).toBe(true);
    expect(r.error).toBe('NO_SCREENSHOT');
    expect(r.manualVerificationNeeded).toBe(true);
  });

  it('provider boş → NO_PROVIDER, fetch çağrılmaz', async () => {
    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png', provider: '' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r.error).toBe('NO_PROVIDER');
  });

  it('baseUrl boş → NO_BASE_URL', async () => {
    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png', baseUrl: null });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r.error).toBe('NO_BASE_URL');
  });

  it('model boş → NO_MODEL', async () => {
    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png', model: null });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r.error).toBe('NO_MODEL');
  });

  it('başarılı Ollama JSON yanıtı parse edilir ve normalize olur', async () => {
    mockFetchOnce(ollamaJsonResponse({
      sitePurpose: 'Kurumsal tanıtım sayfası',
      siteCategory: 'corporate',
      visualSummary: 'Logo ve menü görünüyor',
      visibleElements: ['logo', 'menu'],
      securitySignals: [
        { type: 'LOGIN_PANEL_VISIBLE', confidence: 0.8, reason: 'Form var' },
      ],
      riskLevel: 'LOW',
      securityCommentary: 'Manuel doğrulama önerilir',
      recommendations: ['HTTPS kullan'],
      manualVerificationNeeded: true,
    }));

    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(r.enabled).toBe(true);
    expect(r.provider).toBe('ollama');
    expect(r.model).toBe('llava:latest');
    expect(r.sitePurpose).toBe('Kurumsal tanıtım sayfası');
    expect(r.siteCategory).toBe('corporate');
    expect(r.securitySignals).toHaveLength(1);
    expect(r.securitySignals[0]).toEqual({ type: 'LOGIN_PANEL_VISIBLE', confidence: 0.8, reason: 'Form var' });
    expect(r.riskLevel).toBe('LOW');
    expect(r.recommendations).toEqual(['HTTPS kullan']);
    expect(r.manualVerificationNeeded).toBe(true);
    expect(r.error).toBeUndefined();
    expect(typeof r.checkedAt).toBe('string');
  });

  it('Ollama POST gövdesi base64 image + model + prompt içerir', async () => {
    mockFetchOnce(ollamaJsonResponse({
      sitePurpose: 'x',
      siteCategory: 'unknown',
      visualSummary: 'x',
      visibleElements: [],
      securitySignals: [],
      riskLevel: 'LOW',
      securityCommentary: 'x',
      recommendations: [],
      manualVerificationNeeded: false,
    }));

    await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png' });

    const [calledUrl, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(calledUrl).toBe('http://localhost:11434/api/generate');
    const body = JSON.parse((opts as { body: string }).body);
    expect(body.model).toBe('llava:latest');
    expect(body.stream).toBe(false);
    expect(Array.isArray(body.images)).toBe(true);
    expect(body.images[0]).toBe(Buffer.from('fake-image-bytes').toString('base64'));
    expect(typeof body.prompt).toBe('string');
  });

  it('markdown code fence içinde JSON gelirse temizlenip parse edilir', async () => {
    const inner = JSON.stringify({
      sitePurpose: 'Test',
      siteCategory: 'unknown',
      visualSummary: 'Test',
      visibleElements: [],
      securitySignals: [],
      riskLevel: 'LOW',
      securityCommentary: 'x',
      recommendations: [],
      manualVerificationNeeded: false,
    });
    const wrapped = '```json\n' + inner + '\n```';
    mockFetchOnce(JSON.stringify({ response: wrapped }));

    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png' });
    expect(r.sitePurpose).toBe('Test');
    expect(r.error).toBeUndefined();
  });

  it('invalid JSON response → rawText + error AI_JSON_PARSE_FAILED', async () => {
    mockFetchOnce(JSON.stringify({ response: 'this is not json at all' }));

    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png' });
    expect(r.error).toBe('AI_JSON_PARSE_FAILED');
    expect(r.rawText).toBe('this is not json at all');
    expect(r.manualVerificationNeeded).toBe(true);
  });

  it('fetch network hatası → error AI_REQUEST_FAILED, throw etmez', async () => {
    mockFetchReject(new Error('ECONNREFUSED'));
    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png' });
    expect(r.error).toMatch(/AI_REQUEST_FAILED/);
    expect(r.manualVerificationNeeded).toBe(true);
  });

  it('AbortError → AI_TIMEOUT döner', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    mockFetchReject(abortErr);

    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png' });
    expect(r.error).toBe('AI_TIMEOUT');
  });

  it('HTTP 500 → AI_REQUEST_FAILED (OLLAMA_HTTP_500)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png' });
    expect(r.error).toMatch(/OLLAMA_HTTP_500/);
  });

  it('securitySignals array değilse [] olur, diğer alanlar normalize edilir', async () => {
    mockFetchOnce(ollamaJsonResponse({
      sitePurpose: 'x',
      siteCategory: 'unknown',
      visualSummary: 'x',
      visibleElements: 'not-an-array',
      securitySignals: 'broken',
      riskLevel: 'WHATEVER',
      securityCommentary: 'x',
      recommendations: { not: 'array' },
      manualVerificationNeeded: 'true',
    }));

    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png' });
    expect(r.error).toBeUndefined();
    expect(r.securitySignals).toEqual([]);
    expect(r.visibleElements).toEqual([]);
    expect(r.recommendations).toEqual([]);
    expect(r.riskLevel).toBeNull(); // geçersiz değer → null fallback
    expect(r.manualVerificationNeeded).toBe(true);
  });

  it('securitySignals içindeki geçersiz item drop edilir', async () => {
    mockFetchOnce(ollamaJsonResponse({
      sitePurpose: 'x',
      siteCategory: 'unknown',
      visualSummary: 'x',
      visibleElements: [],
      securitySignals: [
        { type: 'INVALID_TYPE', confidence: 0.5, reason: 'x' },
        { type: 'LOGIN_PANEL_VISIBLE', confidence: 1.5, reason: 'over 1' },
        { type: 'ADMIN_PANEL_VISIBLE', confidence: -1, reason: 'under 0' },
        'not-an-object',
      ],
      riskLevel: 'HIGH',
      securityCommentary: 'x',
      recommendations: [],
      manualVerificationNeeded: false,
    }));

    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png' });
    expect(r.securitySignals).toHaveLength(2);
    expect(r.securitySignals[0]).toEqual({ type: 'LOGIN_PANEL_VISIBLE', confidence: 1, reason: 'over 1' });
    expect(r.securitySignals[1]).toEqual({ type: 'ADMIN_PANEL_VISIBLE', confidence: 0, reason: 'under 0' });
  });

  it('geçersiz siteCategory → unknown fallback', async () => {
    mockFetchOnce(ollamaJsonResponse({
      sitePurpose: 'x',
      siteCategory: 'banking',
      visualSummary: 'x',
      visibleElements: [],
      securitySignals: [],
      riskLevel: 'LOW',
      securityCommentary: 'x',
      recommendations: [],
      manualVerificationNeeded: false,
    }));

    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/tmp/x.png' });
    expect(r.siteCategory).toBe('unknown');
  });

  it('image read hatasında IMAGE_READ_FAILED döner, fetch çağrılmaz', async () => {
    (fsPromises.readFile as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));
    const r = await analyzeScreenshotWithAi({ ...baseInput, screenshotPath: '/missing.png' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r.error).toMatch(/IMAGE_READ_FAILED/);
  });

  it('desteklenmeyen provider → UNSUPPORTED_PROVIDER', async () => {
    const r = await analyzeScreenshotWithAi({
      ...baseInput,
      provider: 'openai-vision',
      screenshotPath: '/tmp/x.png',
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r.error).toMatch(/UNSUPPORTED_PROVIDER/);
  });
});
