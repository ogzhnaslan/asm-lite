import { checkReputation } from './reputation.check';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function mockFetchJson(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as any);
}

function mockFetchOk(body: unknown) {
  mockFetchJson(200, body);
}

function urlhausNoResults() {
  return { query_status: 'no_results' };
}

function urlhausActive(urls: Array<{ url_status: string; threat?: string; tags?: string[]; url?: string; date_added?: string }> = []) {
  return {
    query_status: 'is_host',
    urls: urls.map((u, i) => ({ url: u.url ?? `http://example.com/item${i}`, ...u })),
    blacklists: { spamhaus_dbl: 'not listed', surbl: 'not listed' },
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('checkReputation', () => {
  beforeEach(() => {
    delete process.env.ENABLE_REPUTATION;
    jest.clearAllMocks();
    global.fetch = jest.fn(); // prevent real network calls
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  // ─── 1. Feature disabled ───────────────────────────────────────────────────

  describe('ENABLE_REPUTATION kapalı', () => {
    it('env ayarlanmamışsa skipped=true, skipReason=FEATURE_DISABLED, fetch çağrılmaz', async () => {
      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('FEATURE_DISABLED');
      expect(result.enabled).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('ENABLE_REPUTATION=false → skipped=true, fetch çağrılmaz', async () => {
      process.env.ENABLE_REPUTATION = 'false';

      const result = await checkReputation('1.2.3.4', 'IP');

      expect(result.skipped).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('ENABLE_REPUTATION=false → assetType doğru taşınır', async () => {
      process.env.ENABLE_REPUTATION = 'false';

      const result = await checkReputation('1.2.3.4', 'IP');

      expect(result.assetValue).toBe('1.2.3.4');
      expect(result.assetType).toBe('IP');
    });
  });

  // ─── 2. IP asset — URLhaus-only mode ─────────────────────────────────────
  // AbuseIPDB tamamen kaldırıldı. Reputation artık sadece URLhaus ile çalışır;
  // URLhaus host endpoint domain odaklı olduğu için IP asset geldiğinde fetch
  // yapılmadan skipped=IP_NOT_SUPPORTED_BY_URLHAUS_ONLY_MODE döner.

  describe('IP asset — URLhaus-only mode', () => {
    beforeEach(() => {
      process.env.ENABLE_REPUTATION = 'true';
    });

    it('IP asset → skipped=true, skipReason=IP_NOT_SUPPORTED_BY_URLHAUS_ONLY_MODE', async () => {
      const result = await checkReputation('1.2.3.4', 'IP');

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('IP_NOT_SUPPORTED_BY_URLHAUS_ONLY_MODE');
      expect(result.enabled).toBe(false);
    });

    it('IP asset → fetch çağrılmaz (URLhaus host endpoint domain odaklı)', async () => {
      await checkReputation('1.2.3.4', 'IP');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('IP asset → providers=[], isMalicious=false, maxScore=null, categories=[]', async () => {
      const result = await checkReputation('1.2.3.4', 'IP');

      expect(result.providers).toEqual([]);
      expect(result.isMalicious).toBe(false);
      expect(result.maxScore).toBeNull();
      expect(result.categories).toEqual([]);
    });

    it('IP asset → assetType ve assetValue result\'ta korunur', async () => {
      const result = await checkReputation('1.2.3.4', 'IP');

      expect(result.assetType).toBe('IP');
      expect(result.assetValue).toBe('1.2.3.4');
    });
  });

  // ─── 4. DOMAIN asset → URLhaus ───────────────────────────────────────────

  describe('DOMAIN asset — URLhaus', () => {
    beforeEach(() => {
      process.env.ENABLE_REPUTATION = 'true';
    });

    it('DOMAIN asset için URLhaus çağrılır (AbuseIPDB değil)', async () => {
      mockFetchOk(urlhausNoResults());

      await checkReputation('example.com', 'DOMAIN');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('urlhaus-api.abuse.ch'),
        expect.any(Object),
      );
    });

    it('DOMAIN asset için AbuseIPDB key olmadan çalışır', async () => {
      mockFetchOk(urlhausNoResults());

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.skipped).toBe(false);
      expect(result.providers[0].name).toBe('urlhaus');
    });

    it('no_results → isMalicious false, reportCount 0', async () => {
      mockFetchOk(urlhausNoResults());

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.isMalicious).toBe(false);
      expect(result.providers[0].reportCount).toBe(0);
      expect(result.providers[0].status).toBe('ok');
    });

    it('online URL varsa → score 85, isMalicious true', async () => {
      mockFetchOk(urlhausActive([
        { url_status: 'online', threat: 'malware_download', url: 'http://example.com/malware' },
      ]));

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.isMalicious).toBe(true);
      expect(result.providers[0].score).toBe(85);
    });

    it('offline URL varsa (online yok) → score 55, isMalicious true', async () => {
      mockFetchOk(urlhausActive([
        { url_status: 'offline', threat: 'phishing', url: 'http://example.com/phish' },
      ]));

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.isMalicious).toBe(true);
      expect(result.providers[0].score).toBe(55);
    });

    it('spamhaus_dbl blacklist → score 60, isMalicious true, categories spamhaus_dbl içerir', async () => {
      mockFetchOk({
        query_status: 'is_host',
        urls: [],
        blacklists: { spamhaus_dbl: 'spamhaus_dbl_spam', surbl: 'not listed' },
      });

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.providers[0].score).toBe(60);
      expect(result.isMalicious).toBe(true);
      expect(result.categories).toContain('spamhaus_dbl');
    });

    it('surbl blacklist → score 60, categories surbl içerir', async () => {
      mockFetchOk({
        query_status: 'is_host',
        urls: [],
        blacklists: { spamhaus_dbl: 'not listed', surbl: 'multi.surbl.org' },
      });

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.providers[0].score).toBe(60);
      expect(result.categories).toContain('surbl');
    });

    it('threat ve tags kategorilere eklenir', async () => {
      mockFetchOk(urlhausActive([
        { url_status: 'online', threat: 'malware_download', tags: ['emotet', 'botnet'], url: 'http://example.com/x' },
      ]));

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.categories).toContain('malware_download');
      expect(result.categories).toContain('emotet');
      expect(result.categories).toContain('botnet');
    });

    it('matchedIndicators maksimum 10 URL içerir', async () => {
      const urls = Array.from({ length: 15 }, (_, i) => ({
        url_status: 'online',
        url: `http://example.com/path${i}`,
      }));
      mockFetchOk(urlhausActive(urls));

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.providers[0].matchedIndicators.length).toBeLessThanOrEqual(10);
    });

    it('fetch headers Content-Type ve User-Agent içerir; Auth-Key gönderilmez', async () => {
      // URLhaus host endpoint authentication gerektirmez; kod URLHAUS_API_KEY env'ini okumaz.
      mockFetchOk(urlhausNoResults());

      await checkReputation('example.com', 'DOMAIN');

      const [, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(headers['User-Agent']).toBe('ASM-Scanner/1.0');
      expect(headers['Auth-Key']).toBeUndefined();
    });

    it('reportCount toplam URL sayısı', async () => {
      mockFetchOk(urlhausActive([
        { url_status: 'online', url: 'http://example.com/1' },
        { url_status: 'offline', url: 'http://example.com/2' },
      ]));

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.providers[0].reportCount).toBe(2);
    });

    it('HTTP 401 → provider error HTTP_401, top-level error HTTP_401', async () => {
      // Kod URLhaus için özel URLHAUS_KEY_REQUIRED kodu üretmez; tüm non-200 → HTTP_<status>.
      mockFetchJson(401, {});

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.providers[0].status).toBe('error');
      expect(result.providers[0].error).toBe('HTTP_401');
      expect(result.error).toBe('HTTP_401');
    });

    it('HTTP 500 → HTTP_500 propagated to top-level', async () => {
      mockFetchJson(500, {});

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.providers[0].status).toBe('error');
      expect(result.providers[0].error).toBe('HTTP_500');
      expect(result.error).toBe('HTTP_500');
    });

    it('fetch reject → REQUEST_FAILED propagated to top-level', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network'));

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.providers[0].error).toBe('REQUEST_FAILED');
      expect(result.error).toBe('REQUEST_FAILED');
    });

    it('AbortError → TIMEOUT', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      global.fetch = jest.fn().mockRejectedValue(abortErr);

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.providers[0].error).toBe('TIMEOUT');
    });
  });

  // ─── 5. Provider error propagation ──────────────────────────────────────

  describe('provider error propagation', () => {
    it('URLhaus fail → provider error propagated to top-level, isMalicious false', async () => {
      process.env.ENABLE_REPUTATION = 'true';
      global.fetch = jest.fn().mockRejectedValue(new Error('network'));

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.error).toBe('REQUEST_FAILED');
      expect(result.isMalicious).toBe(false);
      expect(result.maxScore).toBeNull();
    });

    it('error durumunda skipped=false, enabled=true', async () => {
      process.env.ENABLE_REPUTATION = 'true';
      global.fetch = jest.fn().mockRejectedValue(new Error('network'));

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.skipped).toBe(false);
      expect(result.enabled).toBe(true);
    });
  });

  // ─── 6. maxScore ve categories aggregation ───────────────────────────────

  describe('maxScore ve categories aggregation', () => {
    it('score null dönen provider maxScore\'a katkı vermez', async () => {
      process.env.ENABLE_REPUTATION = 'true';
      // URLhaus no_results → score: null
      mockFetchOk(urlhausNoResults());

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.maxScore).toBeNull();
    });

    it('failed provider isMalicious hesabına katılmaz', async () => {
      process.env.ENABLE_REPUTATION = 'true';
      global.fetch = jest.fn().mockRejectedValue(new Error('network'));

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.isMalicious).toBe(false);
    });
  });

  // ─── 7. Result shape ─────────────────────────────────────────────────────

  describe('result shape', () => {
    it('başarılı DOMAIN result — zorunlu alanlar dolu', async () => {
      process.env.ENABLE_REPUTATION = 'true';
      mockFetchOk(urlhausNoResults());

      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.assetValue).toBe('example.com');
      expect(result.assetType).toBe('DOMAIN');
      expect(result.enabled).toBe(true);
      expect(result.skipped).toBe(false);
      expect(Array.isArray(result.providers)).toBe(true);
      expect(Array.isArray(result.categories)).toBe(true);
      expect(typeof result.checkedAt).toBe('string');
      expect(new Date(result.checkedAt).getTime()).not.toBeNaN();
    });

    it('skipped result — providers boş dizi, isMalicious false', async () => {
      const result = await checkReputation('example.com', 'DOMAIN');

      expect(result.providers).toEqual([]);
      expect(result.isMalicious).toBe(false);
      expect(result.maxScore).toBeNull();
      expect(result.categories).toEqual([]);
    });
  });
});
