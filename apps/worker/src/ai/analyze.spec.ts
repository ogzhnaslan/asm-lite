// ─── Mock setup ──────────────────────────────────────────────────────────────
// @anthropic-ai/sdk is mocked with a factory so that `mockCreate` is a stable
// reference captured inside the closure. The module-level `_anthropicClient`
// singleton in analyze.ts is created once (first Anthropic test) and reused.
// Because `mockCreate` is always the same jest.fn(), clearAllMocks() between
// tests only resets call history — the function reference stays consistent.

jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  (MockAnthropic as any).__mockCreate = mockCreate;
  return { __esModule: true, default: MockAnthropic };
});

jest.mock('../utils/logger', () => ({ log: jest.fn() }));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { analyzeFindings } from './analyze';
import type { AiAnalysisResult } from './analyze';
import Anthropic from '@anthropic-ai/sdk';
import { log } from '../utils/logger';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockLog = log as jest.MockedFunction<typeof log>;

/** Access the stable mock for `client.messages.create`. */
const mockCreate = () => (Anthropic as any).__mockCreate as jest.Mock;

const asset = { value: 'example.com', type: 'DOMAIN' };

const findings = [
  {
    key: 'DNS_DMARC_MISSING:example.com',
    type: 'DNS_DMARC_MISSING',
    severity: 'HIGH',
    dataJson: { domain: 'example.com' },
  },
  {
    key: 'PORT_EXPOSED:example.com:22',
    type: 'PORT_EXPOSED',
    severity: 'CRITICAL',
    dataJson: { port: 22 },
  },
];

const sampleResult: AiAnalysisResult[] = [
  {
    key: 'DNS_DMARC_MISSING:example.com',
    aiScore: 70,
    aiWhyJson: {
      summary: 'DMARC kaydı eksik.',
      reasons: ['DMARC kaydı bulunamadı.'],
      recommendations: ['_dmarc TXT kaydı ekleyin.'],
      context: 'E-posta sahteciliği riskini azaltır.',
    },
  },
];

function ollamaOk(content: string): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ message: { content } }),
  } as Response);
}

function ollamaFail(status: number): Promise<Response> {
  return Promise.resolve({ ok: false, status } as Response);
}

// ─── Global setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).fetch = jest.fn();

  delete process.env.AI_PROVIDER;
  delete process.env.OLLAMA_HOST;
  delete process.env.OLLAMA_MODEL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('analyzeFindings', () => {
  // ── 1. Empty findings early-return ────────────────────────────────────────

  describe('empty findings', () => {
    it('returns [] without calling any provider', async () => {
      const result = await analyzeFindings(asset, []);

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockCreate()).not.toHaveBeenCalled();
    });

    it('does not log ai provider when findings are empty', async () => {
      await analyzeFindings(asset, []);

      expect(mockLog).not.toHaveBeenCalledWith('ai provider', expect.anything());
    });
  });

  // ── 2. Ollama provider ────────────────────────────────────────────────────

  describe('Ollama provider', () => {
    beforeEach(() => {
      process.env.AI_PROVIDER = 'ollama';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'llama3.2';
    });

    it('parses a successful JSON array response', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        ollamaOk(JSON.stringify(sampleResult)),
      );

      const result = await analyzeFindings(asset, findings);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('DNS_DMARC_MISSING:example.com');
      expect(result[0].aiScore).toBe(70);
      expect(result[0].aiWhyJson.summary).toBe('DMARC kaydı eksik.');
      expect(result[0].aiWhyJson.recommendations).toEqual(['_dmarc TXT kaydı ekleyin.']);
    });

    it('calls the correct Ollama endpoint', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        ollamaOk(JSON.stringify(sampleResult)),
      );

      await analyzeFindings(asset, findings);

      const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:11434/api/chat');
    });

    it('sends model, stream:false, system+user messages in body', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        ollamaOk(JSON.stringify(sampleResult)),
      );

      await analyzeFindings(asset, findings);

      const [, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);

      expect(body.model).toBe('llama3.2');
      expect(body.stream).toBe(false);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
    });

    it('returns [] on malformed JSON response and logs parse error', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        ollamaOk('this is not json at all'),
      );

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai parse error',
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    it('strips markdown code fences and parses the JSON inside', async () => {
      const fenced = '```json\n' + JSON.stringify(sampleResult) + '\n```';
      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaOk(fenced));

      const result = await analyzeFindings(asset, findings);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('DNS_DMARC_MISSING:example.com');
    });

    it('returns [] when response is a JSON object instead of array', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        ollamaOk(JSON.stringify({ key: 'test', aiScore: 60 })),
      );

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
    });

    it('returns [] on fetch network error and logs ai error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network failure'));

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai error',
        expect.objectContaining({ error: 'Network failure', provider: 'ollama' }),
      );
    });

    it('returns [] on Ollama HTTP 500 and logs ai error', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaFail(500));

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai error',
        expect.objectContaining({ error: 'Ollama HTTP 500' }),
      );
    });

    it('returns [] on Ollama HTTP 503 and logs ai error', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaFail(503));

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai error',
        expect.objectContaining({ error: 'Ollama HTTP 503' }),
      );
    });

    it('uses default host and model when env vars are absent', async () => {
      delete process.env.OLLAMA_HOST;
      delete process.env.OLLAMA_MODEL;

      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaOk('[]'));

      await analyzeFindings(asset, findings);

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:11434/api/chat');
      expect(JSON.parse(opts.body as string).model).toBe('llama3.2');
    });
  });

  // ── 3. Anthropic provider ─────────────────────────────────────────────────

  describe('Anthropic provider', () => {
    beforeEach(() => {
      process.env.AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'test-key-secret';
      process.env.ANTHROPIC_MODEL = 'claude-test';
    });

    it('returns [] and logs skip when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith('ai skip: ANTHROPIC_API_KEY not set');
      expect(mockCreate()).not.toHaveBeenCalled();
    });

    it('parses a successful text response', async () => {
      mockCreate().mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(sampleResult) }],
      });

      const result = await analyzeFindings(asset, findings);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('DNS_DMARC_MISSING:example.com');
      expect(result[0].aiScore).toBe(70);
      expect(result[0].aiWhyJson.summary).toBe('DMARC kaydı eksik.');
    });

    it('calls messages.create with configured model and correct structure', async () => {
      mockCreate().mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });

      await analyzeFindings(asset, findings);

      const call = mockCreate().mock.calls[0][0] as Record<string, unknown>;
      expect(call.model).toBe('claude-test');
      expect(call.max_tokens).toBe(2048);
      expect(call.system).toBeDefined();
      expect((call.messages as Array<{ role: string }>)[0].role).toBe('user');
    });

    it('uses default model when ANTHROPIC_MODEL is not set', async () => {
      delete process.env.ANTHROPIC_MODEL;
      mockCreate().mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });

      await analyzeFindings(asset, findings);

      const call = mockCreate().mock.calls[0][0] as Record<string, unknown>;
      expect(call.model).toBe('claude-haiku-4-5-20251001');
    });

    it('does not leak API key into the result', async () => {
      mockCreate().mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(sampleResult) }],
      });

      const result = await analyzeFindings(asset, findings);

      expect(JSON.stringify(result)).not.toContain('test-key-secret');
    });

    it('does not include API key in the messages sent to the model', async () => {
      mockCreate().mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });

      await analyzeFindings(asset, findings);

      const call = mockCreate().mock.calls[0][0];
      expect(JSON.stringify(call)).not.toContain('test-key-secret');
    });

    it('returns [] on malformed JSON response and logs parse error', async () => {
      mockCreate().mockResolvedValueOnce({
        content: [{ type: 'text', text: 'not valid json {{{' }],
      });

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai parse error',
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    it('returns [] when content block type is not text', async () => {
      mockCreate().mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu_01' }],
      });

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
    });

    it('returns [] on Anthropic API rejection and logs ai error', async () => {
      mockCreate().mockRejectedValueOnce(new Error('Anthropic API error'));

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai error',
        expect.objectContaining({ error: 'Anthropic API error', provider: 'anthropic' }),
      );
    });
  });

  // ── 4. Default and unsupported providers ──────────────────────────────────

  describe('default and unsupported providers', () => {
    it('uses Ollama when AI_PROVIDER is not set (default)', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        ollamaOk(JSON.stringify(sampleResult)),
      );

      const result = await analyzeFindings(asset, findings);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it('falls back to Ollama for an unknown provider value', async () => {
      process.env.AI_PROVIDER = 'unknown-provider';
      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaOk('[]'));

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('logs the active provider name for every non-empty call', async () => {
      process.env.AI_PROVIDER = 'ollama';
      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaOk('[]'));

      await analyzeFindings(asset, findings);

      expect(mockLog).toHaveBeenCalledWith('ai provider', { provider: 'ollama' });
    });
  });

  // ── 5. Prompt content validation ──────────────────────────────────────────

  describe('prompt content', () => {
    beforeEach(() => {
      process.env.AI_PROVIDER = 'ollama';
    });

    it('includes asset value and type in the user message', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaOk('[]'));

      await analyzeFindings({ value: 'test-asset.io', type: 'IP' }, findings);

      const [, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      const userContent: string = body.messages[1].content;

      expect(userContent).toContain('test-asset.io');
      expect(userContent).toContain('IP');
    });

    it('includes finding key, type, and severity in the user message', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaOk('[]'));

      await analyzeFindings(asset, findings);

      const [, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      const userContent: string = body.messages[1].content;

      expect(userContent).toContain('DNS_DMARC_MISSING:example.com');
      expect(userContent).toContain('DNS_DMARC_MISSING');
      expect(userContent).toContain('HIGH');
    });

    it('requests a JSON array output in the user message', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaOk('[]'));

      await analyzeFindings(asset, findings);

      const [, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      const userContent: string = body.messages[1].content;

      expect(userContent.toLowerCase()).toContain('json');
      expect(userContent).toContain('aiScore');
      expect(userContent).toContain('aiWhyJson');
    });

    it('system prompt requests Turkish responses', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaOk('[]'));

      await analyzeFindings(asset, findings);

      const [, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      const systemContent: string = body.messages[0].content;

      expect(systemContent).toContain('Türkçe');
    });

    it('system prompt restricts output to JSON only', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaOk('[]'));

      await analyzeFindings(asset, findings);

      const [, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      const systemContent: string = body.messages[0].content;

      expect(systemContent.toLowerCase()).toContain('json');
    });

    it('system prompt explicitly forbids exploit and attack content', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => ollamaOk('[]'));

      await analyzeFindings(asset, findings);

      const [, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      const systemContent: string = body.messages[0].content;

      // The system prompt must contain these safety restrictions:
      // "Exploit, saldırı kodu veya yetkisiz erişim adımları vermeyeceksin."
      expect(systemContent).toMatch(/exploit|saldırı|yetkisiz/i);
    });
  });

  // ── 6. Response validation ────────────────────────────────────────────────
  //
  // parseResponse() validates each item individually. Invalid items are skipped
  // with a log('ai validation skipped item', { reason }) call. Valid items in the
  // same array are still returned — a bad LLM item does not poison the whole batch.

  describe('response validation', () => {
    beforeEach(() => {
      process.env.AI_PROVIDER = 'ollama';
    });

    const validItem = {
      key: 'DNS_DMARC_MISSING:example.com',
      aiScore: 70,
      aiWhyJson: {
        summary: 'DMARC kaydı eksik.',
        reasons: ['Neden 1'],
        recommendations: ['Öneri 1'],
      },
    };

    function ollamaWith(items: unknown[]): void {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        ollamaOk(JSON.stringify(items)),
      );
    }

    it('rejects an item with missing key', async () => {
      ollamaWith([{ aiScore: 70, aiWhyJson: { summary: 'test', reasons: [], recommendations: [] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('key') }),
      );
    });

    it('rejects an item with an empty string key', async () => {
      ollamaWith([{ key: '   ', aiScore: 70, aiWhyJson: { summary: 'test', reasons: [], recommendations: [] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith('ai validation skipped item', expect.any(Object));
    });

    it('rejects an item with string aiScore', async () => {
      ollamaWith([{ key: 'KEY:x', aiScore: 'seventy', aiWhyJson: { summary: 'test', reasons: [], recommendations: [] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('aiScore') }),
      );
    });

    it('rejects an item with null aiScore', async () => {
      ollamaWith([{ key: 'KEY:x', aiScore: null, aiWhyJson: { summary: 'test', reasons: [], recommendations: [] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('aiScore') }),
      );
    });

    it('rejects an item with aiScore > 100', async () => {
      ollamaWith([{ key: 'KEY:x', aiScore: 150, aiWhyJson: { summary: 'test', reasons: [], recommendations: [] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('aiScore') }),
      );
    });

    it('rejects an item with aiScore < 0', async () => {
      ollamaWith([{ key: 'KEY:x', aiScore: -10, aiWhyJson: { summary: 'test', reasons: [], recommendations: [] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('aiScore') }),
      );
    });

    it('accepts boundary aiScore value 0', async () => {
      ollamaWith([{ ...validItem, aiScore: 0 }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toHaveLength(1);
      expect(result[0].aiScore).toBe(0);
    });

    it('accepts boundary aiScore value 100', async () => {
      ollamaWith([{ ...validItem, aiScore: 100 }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toHaveLength(1);
      expect(result[0].aiScore).toBe(100);
    });

    it('rejects an item with missing aiWhyJson', async () => {
      ollamaWith([{ key: 'KEY:x', aiScore: 70 }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('aiWhyJson') }),
      );
    });

    it('rejects an item with missing aiWhyJson.summary', async () => {
      ollamaWith([{ key: 'KEY:x', aiScore: 70, aiWhyJson: { reasons: [], recommendations: [] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('summary') }),
      );
    });

    it('rejects an item with empty string aiWhyJson.summary', async () => {
      ollamaWith([{ key: 'KEY:x', aiScore: 70, aiWhyJson: { summary: '', reasons: [], recommendations: [] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('summary') }),
      );
    });

    it('rejects an item where aiWhyJson.reasons is a string instead of array', async () => {
      ollamaWith([{ key: 'KEY:x', aiScore: 70, aiWhyJson: { summary: 'test', reasons: 'bir neden', recommendations: [] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('reasons') }),
      );
    });

    it('rejects an item where aiWhyJson.reasons contains a non-string element', async () => {
      ollamaWith([{ key: 'KEY:x', aiScore: 70, aiWhyJson: { summary: 'test', reasons: [42], recommendations: [] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('reasons') }),
      );
    });

    it('rejects an item where aiWhyJson.recommendations is a string instead of array', async () => {
      ollamaWith([{ key: 'KEY:x', aiScore: 70, aiWhyJson: { summary: 'test', reasons: [], recommendations: 'öneri' } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('recommendations') }),
      );
    });

    it('rejects an item where aiWhyJson.recommendations contains a non-string element', async () => {
      ollamaWith([{ key: 'KEY:x', aiScore: 70, aiWhyJson: { summary: 'test', reasons: [], recommendations: [null] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('recommendations') }),
      );
    });

    it('rejects an item where aiWhyJson.context is a number', async () => {
      ollamaWith([{ ...validItem, aiWhyJson: { ...validItem.aiWhyJson, context: 123 } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        'ai validation skipped item',
        expect.objectContaining({ reason: expect.stringContaining('context') }),
      );
    });

    it('accepts an item where aiWhyJson.context is a valid string', async () => {
      ollamaWith([{ ...validItem, aiWhyJson: { ...validItem.aiWhyJson, context: 'Bağlam bilgisi.' } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toHaveLength(1);
      expect(result[0].aiWhyJson.context).toBe('Bağlam bilgisi.');
    });

    it('accepts empty reasons and recommendations arrays', async () => {
      ollamaWith([{ ...validItem, aiWhyJson: { ...validItem.aiWhyJson, reasons: [], recommendations: [] } }]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toHaveLength(1);
    });

    it('returns only valid items from a mixed response and logs each skipped item', async () => {
      ollamaWith([
        validItem,                                                                               // valid
        { aiScore: 70, aiWhyJson: { summary: 'no key', reasons: [], recommendations: [] } },    // missing key
        { key: 'KEY:y', aiScore: 150, aiWhyJson: { summary: 'bad', reasons: [], recommendations: [] } }, // score > 100
        { key: 'KEY:z', aiScore: 50 },                                                          // missing aiWhyJson
      ]);

      const result = await analyzeFindings(asset, findings);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('DNS_DMARC_MISSING:example.com');

      const skipped = mockLog.mock.calls.filter(([tag]) => tag === 'ai validation skipped item');
      expect(skipped).toHaveLength(3);
    });
  });
});
