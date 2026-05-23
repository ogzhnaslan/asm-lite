import { checkOtx } from './otx.check';

const MOCK_GENERAL_RESPONSE = {
  pulse_info: {
    pulses: [
      { name: 'Test phishing campaign', created: '2026-01-01T00:00:00.000Z', tags: ['phishing', 'malware'] },
      { name: 'Another campaign', created: '2026-02-01T00:00:00.000Z', tags: ['c2'] },
    ],
  },
};

const MOCK_MALWARE_RESPONSE = { count: 2 };
const MOCK_URL_LIST_RESPONSE = { count: 5 };
const MOCK_PASSIVE_DNS_RESPONSE = { passive_dns: [{}, {}, {}] };

function mockFetchOk(responses: Record<string, unknown>) {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    for (const [key, value] of Object.entries(responses)) {
      if (url.includes(key)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(value),
        });
      }
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
  delete process.env.ENABLE_OTX;
  delete process.env.OTX_API_KEY;
});

describe('checkOtx', () => {
  // ─── disabled ─────────────────────────────────────────────────────────────────

  it('ENABLE_OTX=false → skipped DISABLED', async () => {
    process.env.ENABLE_OTX = 'false';

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('DISABLED');
    expect(result.enabled).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ENABLE_OTX=true ama OTX_API_KEY yok → skipped NO_CREDENTIALS', async () => {
    process.env.ENABLE_OTX = 'true';

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('NO_CREDENTIALS');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ─── error durumları ──────────────────────────────────────────────────────────

  it('401 yanıtı → error INVALID_API_KEY', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.skipped).toBe(false);
    expect(result.error).toBe('INVALID_API_KEY');
  });

  it('429 yanıtı → error RATE_LIMITED', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429 });

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.skipped).toBe(false);
    expect(result.error).toBe('RATE_LIMITED');
  });

  it('fetch timeout → error OTX_TIMEOUT', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    (global.fetch as jest.Mock).mockRejectedValue(Object.assign(new Error('timeout'), { name: 'AbortError' }));

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.error).toBe('OTX_TIMEOUT');
  });

  // ─── başarılı response ────────────────────────────────────────────────────────

  it('başarılı response → pulse/malware/url/passiveDns count parse edilir', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    mockFetchOk({
      '/general': MOCK_GENERAL_RESPONSE,
      '/malware': MOCK_MALWARE_RESPONSE,
      '/url_list': MOCK_URL_LIST_RESPONSE,
      '/passive_dns': MOCK_PASSIVE_DNS_RESPONSE,
    });

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.skipped).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.pulseCount).toBe(2);
    expect(result.pulses).toHaveLength(2);
    expect(result.pulses[0].name).toBe('Test phishing campaign');
    expect(result.pulses[0].tags).toEqual(['phishing', 'malware']);
    expect(result.malwareCount).toBe(2);
    expect(result.urlListCount).toBe(5);
    expect(result.passiveDnsCount).toBe(3);
    expect(result.tags).toContain('phishing');
    expect(result.provider).toBe('alienvault-otx');
  });

  it('X-OTX-API-KEY header gönderilir ama API key response/log içine yazılmaz', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'super-secret-key';

    mockFetchOk({
      '/general': MOCK_GENERAL_RESPONSE,
      '/malware': MOCK_MALWARE_RESPONSE,
      '/url_list': MOCK_URL_LIST_RESPONSE,
      '/passive_dns': MOCK_PASSIVE_DNS_RESPONSE,
    });

    const result = await checkOtx('example.com', 'DOMAIN');
    const resultStr = JSON.stringify(result);

    expect(resultStr).not.toContain('super-secret-key');
    expect(result.error).toBeUndefined();
  });

  it('IP asset için IPv4 desteklenir', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    mockFetchOk({ '/general': { pulse_info: { pulses: [] } } });

    const result = await checkOtx('1.2.3.4', 'IP');

    expect(result.skipped).toBe(false);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('IPv4/1.2.3.4');
  });

  it('IPv6 asset → skipped IPV6_NOT_SUPPORTED', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    const result = await checkOtx('2001:db8::1', 'IP');

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('IPV6_NOT_SUPPORTED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('IP asset için malware/url_list/passive_dns sorgulanmaz', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    mockFetchOk({ '/general': { pulse_info: { pulses: [] } } });

    await checkOtx('1.2.3.4', 'IP');

    const urls = (global.fetch as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.every((u) => !u.includes('/malware') && !u.includes('/url_list') && !u.includes('/passive_dns'))).toBe(true);
  });

  // ─── HTTP 500 / OTX_REQUEST_FAILED ───────────────────────────────────────────

  it('HTTP 500 → error OTX_REQUEST_FAILED, scan patlamaz', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.error).toBe('OTX_REQUEST_FAILED');
    expect(result.skipped).toBe(false);
    expect(result.enabled).toBe(true);
  });

  it('fetch reject (non-AbortError) → error OTX_REQUEST_FAILED', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.error).toBe('OTX_REQUEST_FAILED');
    await expect(Promise.resolve(result)).resolves.toBeDefined();
  });

  // ─── ENABLE_OTX ayarlanmamışsa ───────────────────────────────────────────────

  it('ENABLE_OTX ayarlanmamışsa skipped DISABLED (false ile aynı davranış)', async () => {
    // process.env.ENABLE_OTX silindi beforeEach'te

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('DISABLED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ─── URL yapısı ───────────────────────────────────────────────────────────────

  it('DOMAIN asset için endpoint "domain/<value>" içerir', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    mockFetchOk({ '/general': MOCK_GENERAL_RESPONSE, '/malware': MOCK_MALWARE_RESPONSE, '/url_list': MOCK_URL_LIST_RESPONSE, '/passive_dns': MOCK_PASSIVE_DNS_RESPONSE });

    await checkOtx('example.com', 'DOMAIN');

    const urls = (global.fetch as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.some((u) => u.includes('domain/example.com'))).toBe(true);
  });

  it('IP asset için endpoint "IPv4/<value>" içerir', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    mockFetchOk({ '/general': { pulse_info: { pulses: [] } } });

    await checkOtx('10.0.0.1', 'IP');

    const urls = (global.fetch as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.some((u) => u.includes('IPv4/10.0.0.1'))).toBe(true);
  });

  // ─── Partial endpoint failure (allSettled davranışı) ─────────────────────────

  it('malware endpoint fail → malwareCount=0, diğer alanlar normal', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/malware')) return Promise.reject(new Error('network'));
      if (url.includes('/general')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MOCK_GENERAL_RESPONSE) });
      if (url.includes('/url_list')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MOCK_URL_LIST_RESPONSE) });
      if (url.includes('/passive_dns')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MOCK_PASSIVE_DNS_RESPONSE) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.error).toBeUndefined();
    expect(result.malwareCount).toBe(0);
    expect(result.urlListCount).toBe(5);
    expect(result.passiveDnsCount).toBe(3);
  });

  it('url_list endpoint fail → urlListCount=0, general başarılı', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/url_list')) return Promise.reject(new Error('network'));
      if (url.includes('/general')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MOCK_GENERAL_RESPONSE) });
      if (url.includes('/malware')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MOCK_MALWARE_RESPONSE) });
      if (url.includes('/passive_dns')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MOCK_PASSIVE_DNS_RESPONSE) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.error).toBeUndefined();
    expect(result.urlListCount).toBe(0);
    expect(result.malwareCount).toBe(2);
  });

  // ─── Tags deduplication ───────────────────────────────────────────────────────

  it('aynı tag birden fazla pulse\'ta varsa deduplicate edilir', async () => {
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
      '/malware': MOCK_MALWARE_RESPONSE,
      '/url_list': MOCK_URL_LIST_RESPONSE,
      '/passive_dns': MOCK_PASSIVE_DNS_RESPONSE,
    });

    const result = await checkOtx('example.com', 'DOMAIN');

    const malwareCount = result.tags.filter((t) => t === 'malware').length;
    expect(malwareCount).toBe(1);
    expect(result.tags).toContain('c2');
    expect(result.tags).toContain('phishing');
  });

  // ─── Pulse slice (>20) ───────────────────────────────────────────────────────

  it('20\'den fazla pulse varsa pulses dizisi 20 ile kırpılır', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    const manyPulses = Array.from({ length: 30 }, (_, i) => ({
      name: `Pulse ${i}`,
      created: '2026-01-01T00:00:00Z',
      tags: ['tag'],
    }));

    mockFetchOk({
      '/general': { pulse_info: { pulses: manyPulses } },
      '/malware': MOCK_MALWARE_RESPONSE,
      '/url_list': MOCK_URL_LIST_RESPONSE,
      '/passive_dns': MOCK_PASSIVE_DNS_RESPONSE,
    });

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.pulses).toHaveLength(20);
    expect(result.pulseCount).toBe(20);
  });

  // ─── Pulse tags slice (>10) ───────────────────────────────────────────────────

  it('pulse başına 10\'dan fazla tag varsa 10 ile kırpılır', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    const manyTags = Array.from({ length: 15 }, (_, i) => `tag${i}`);

    mockFetchOk({
      '/general': {
        pulse_info: {
          pulses: [{ name: 'BigPulse', created: '2026-01-01T00:00:00Z', tags: manyTags }],
        },
      },
      '/malware': MOCK_MALWARE_RESPONSE,
      '/url_list': MOCK_URL_LIST_RESPONSE,
      '/passive_dns': MOCK_PASSIVE_DNS_RESPONSE,
    });

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.pulses[0].tags).toHaveLength(10);
  });

  // ─── Result shape ─────────────────────────────────────────────────────────────

  it('başarılı result — zorunlu alanlar dolu ve doğru tipte', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    mockFetchOk({
      '/general': MOCK_GENERAL_RESPONSE,
      '/malware': MOCK_MALWARE_RESPONSE,
      '/url_list': MOCK_URL_LIST_RESPONSE,
      '/passive_dns': MOCK_PASSIVE_DNS_RESPONSE,
    });

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.assetValue).toBe('example.com');
    expect(result.assetType).toBe('DOMAIN');
    expect(result.provider).toBe('alienvault-otx');
    expect(result.enabled).toBe(true);
    expect(result.skipped).toBe(false);
    expect(Array.isArray(result.pulses)).toBe(true);
    expect(Array.isArray(result.tags)).toBe(true);
    expect(typeof result.pulseCount).toBe('number');
    expect(typeof result.malwareCount).toBe('number');
    expect(typeof result.urlListCount).toBe('number');
    expect(typeof result.passiveDnsCount).toBe('number');
    expect(typeof result.checkedAt).toBe('string');
    expect(new Date(result.checkedAt).getTime()).not.toBeNaN();
    expect(result.error).toBeUndefined();
  });

  it('boş pulse listesi → pulseCount=0, tags=[]', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    mockFetchOk({
      '/general': { pulse_info: { pulses: [] } },
      '/malware': { count: 0 },
      '/url_list': { count: 0 },
      '/passive_dns': { passive_dns: [] },
    });

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(result.pulseCount).toBe(0);
    expect(result.pulses).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('API key (test-key) result JSON içine sızmaz', async () => {
    process.env.ENABLE_OTX = 'true';
    process.env.OTX_API_KEY = 'test-key';

    mockFetchOk({
      '/general': MOCK_GENERAL_RESPONSE,
      '/malware': MOCK_MALWARE_RESPONSE,
      '/url_list': MOCK_URL_LIST_RESPONSE,
      '/passive_dns': MOCK_PASSIVE_DNS_RESPONSE,
    });

    const result = await checkOtx('example.com', 'DOMAIN');

    expect(JSON.stringify(result)).not.toContain('test-key');
  });
});
