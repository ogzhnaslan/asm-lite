import { OtxLookupService } from './otx-lookup.service';

const MOCK_GENERAL = {
  pulse_info: {
    pulses: [
      { name: 'Test phishing campaign', created: '2026-01-01T00:00:00.000Z', tags: ['phishing', 'malware'] },
      { name: 'Another campaign', created: '2026-02-01T00:00:00.000Z', tags: ['c2'] },
    ],
  },
};
const MOCK_MALWARE = { count: 2 };
const MOCK_URL_LIST = { count: 5 };
const MOCK_PASSIVE_DNS = { passive_dns: [{}, {}, {}] };

function mockFetchOk(responses: Record<string, unknown>) {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    for (const [key, value] of Object.entries(responses)) {
      if (url.includes(key)) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(value) });
      }
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
}

let service: OtxLookupService;

beforeEach(() => {
  service = new OtxLookupService();
  jest.clearAllMocks();
  global.fetch = jest.fn();
  delete process.env.ENABLE_OTX;
  delete process.env.OTX_API_KEY;
});

describe('OtxLookupService.lookup', () => {
  // ─── disabled / skipped ──────────────────────────────────────────────────────

  it('ENABLE_OTX=false → skipped DISABLED, fetch çağrılmaz', async () => {
    process.env.ENABLE_OTX = 'false';
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe('DISABLED');
    expect(r.enabled).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ENABLE_OTX tanımsız → skipped DISABLED', async () => {
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe('DISABLED');
  });

  it('ENABLE_OTX=true, API key yok → skipped NO_CREDENTIALS', async () => {
    process.env.ENABLE_OTX = 'true';
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe('NO_CREDENTIALS');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('IPv6 input → skipped IPV6_NOT_SUPPORTED', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    const r = await service.lookup('2001:db8::1', 'IP');
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe('IPV6_NOT_SUPPORTED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ─── error durumları ──────────────────────────────────────────────────────────

  it('401 yanıtı → error INVALID_API_KEY, endpoint 200', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.error).toBe('INVALID_API_KEY');
    expect(r.skipped).toBe(false);
  });

  it('429 yanıtı → error RATE_LIMITED', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429 });
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.error).toBe('RATE_LIMITED');
  });

  it('HTTP 500 → error OTX_REQUEST_FAILED', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.error).toBe('OTX_REQUEST_FAILED');
  });

  it('fetch reject (AbortError) → error OTX_TIMEOUT', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    (global.fetch as jest.Mock).mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.error).toBe('OTX_TIMEOUT');
  });

  it('fetch reject (non-AbortError) → error OTX_REQUEST_FAILED', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.error).toBe('OTX_REQUEST_FAILED');
  });

  // ─── başarılı domain response ────────────────────────────────────────────────

  it('başarılı DOMAIN response → tüm alanlar parse edilir', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    mockFetchOk({
      '/general': MOCK_GENERAL,
      '/malware': MOCK_MALWARE,
      '/url_list': MOCK_URL_LIST,
      '/passive_dns': MOCK_PASSIVE_DNS,
    });
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.skipped).toBe(false);
    expect(r.error).toBeUndefined();
    expect(r.pulseCount).toBe(2);
    expect(r.pulses[0].name).toBe('Test phishing campaign');
    expect(r.malwareCount).toBe(2);
    expect(r.urlListCount).toBe(5);
    expect(r.passiveDnsCount).toBe(3);
    expect(r.tags).toContain('phishing');
    expect(r.assetValue).toBe('example.com');
    expect(r.assetType).toBe('DOMAIN');
    expect(r.provider).toBe('alienvault-otx');
  });

  it('API key result JSON içine sızmaz', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'super-secret-key-xyz';
    mockFetchOk({
      '/general': MOCK_GENERAL,
      '/malware': MOCK_MALWARE,
      '/url_list': MOCK_URL_LIST,
      '/passive_dns': MOCK_PASSIVE_DNS,
    });
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(JSON.stringify(r)).not.toContain('super-secret-key-xyz');
  });

  it('DOMAIN için endpoint "domain/<value>" içerir', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    mockFetchOk({ '/general': MOCK_GENERAL, '/malware': MOCK_MALWARE, '/url_list': MOCK_URL_LIST, '/passive_dns': MOCK_PASSIVE_DNS });
    await service.lookup('example.com', 'DOMAIN');
    const urls = (global.fetch as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.some((u) => u.includes('domain/example.com'))).toBe(true);
  });

  it('IP için endpoint "IPv4/<value>" içerir', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    mockFetchOk({ '/general': { pulse_info: { pulses: [] } } });
    await service.lookup('1.2.3.4', 'IP');
    const urls = (global.fetch as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.some((u) => u.includes('IPv4/1.2.3.4'))).toBe(true);
  });

  it('IP için malware/url_list/passive_dns sorgulanmaz', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    mockFetchOk({ '/general': { pulse_info: { pulses: [] } } });
    await service.lookup('1.2.3.4', 'IP');
    const urls = (global.fetch as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.every((u) => !u.includes('/malware') && !u.includes('/url_list') && !u.includes('/passive_dns'))).toBe(true);
  });

  it('tag deduplication — aynı tag birden fazla pulse\'ta varsa bir kez yer alır', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    mockFetchOk({
      '/general': {
        pulse_info: {
          pulses: [
            { name: 'P1', created: '2026-01-01T00:00:00Z', tags: ['malware', 'c2'] },
            { name: 'P2', created: '2026-02-01T00:00:00Z', tags: ['malware', 'phishing'] },
          ],
        },
      },
      '/malware': MOCK_MALWARE,
      '/url_list': MOCK_URL_LIST,
      '/passive_dns': MOCK_PASSIVE_DNS,
    });
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.tags.filter((t) => t === 'malware')).toHaveLength(1);
  });

  it('20\'den fazla pulse → 20 ile kırpılır', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    const manyPulses = Array.from({ length: 30 }, (_, i) => ({
      name: `Pulse ${i}`, created: '2026-01-01T00:00:00Z', tags: [],
    }));
    mockFetchOk({
      '/general': { pulse_info: { pulses: manyPulses } },
      '/malware': MOCK_MALWARE,
      '/url_list': MOCK_URL_LIST,
      '/passive_dns': MOCK_PASSIVE_DNS,
    });
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.pulses).toHaveLength(20);
    expect(r.pulseCount).toBe(20);
  });

  it('malware endpoint fail → malwareCount=0, diğer alanlar normal', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/malware')) return Promise.reject(new Error('network'));
      if (url.includes('/general')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MOCK_GENERAL) });
      if (url.includes('/url_list')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MOCK_URL_LIST) });
      if (url.includes('/passive_dns')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MOCK_PASSIVE_DNS) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    const r = await service.lookup('example.com', 'DOMAIN');
    expect(r.error).toBeUndefined();
    expect(r.malwareCount).toBe(0);
    expect(r.urlListCount).toBe(5);
  });
});
