import { checkPhishTank, _resetFeedCache } from './phishtank.check';

const FEED_URL = 'https://test-phishtank-feed.example.com/phishtank.json';
const API_KEY = 'test-api-key-00112233445566778899aabb';

function makeEntry(
  url: string,
  verified: 'yes' | 'no' = 'no',
  online: 'yes' | 'no' = 'no',
) {
  return {
    phish_id: '42',
    url,
    verified,
    online,
    submission_time: '2026-01-01T00:00:00+00:00',
    phish_detail_url: 'https://www.phishtank.com/phish_detail.php?phish_id=42',
    verification_time: '2026-01-02T00:00:00+00:00',
    target: 'Example Corp',
  };
}

function mockFetchOk(entries: unknown[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(entries)),
  } as any);
}

describe('checkPhishTank', () => {
  beforeEach(() => {
    delete process.env.ENABLE_PHISHTANK;
    delete process.env.PHISHTANK_API_KEY;
    delete process.env.PHISHTANK_FEED_URL;
    jest.clearAllMocks();
    global.fetch = jest.fn(); // default: no-op mock so real fetch is never hit
    _resetFeedCache();
  });

  afterEach(() => {
    delete (global as any).fetch;
    _resetFeedCache();
  });

  // ─── 1. ENABLE_PHISHTANK explicit kapalı ─────────────────────────────────────
  // Kod davranışı: enabledRaw 'false' / '0' / 'no' ise skipped=DISABLED. Diğer
  // her durumda (undefined dahil) public default feed otomatik kullanılır.

  describe('ENABLE_PHISHTANK explicit kapalı', () => {
    it('ENABLE_PHISHTANK=false → skipped=true, skipReason=DISABLED, fetch çağrılmaz', async () => {
      process.env.ENABLE_PHISHTANK = 'false';

      const result = await checkPhishTank('example.com');

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('DISABLED');
      expect(result.enabled).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('ENABLE_PHISHTANK=0 → skipped=true, skipReason=DISABLED', async () => {
      process.env.ENABLE_PHISHTANK = '0';

      const result = await checkPhishTank('example.com');

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('DISABLED');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('ENABLE_PHISHTANK=no → skipped=true, skipReason=DISABLED', async () => {
      process.env.ENABLE_PHISHTANK = 'no';

      const result = await checkPhishTank('example.com');

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('DISABLED');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── 2. ENABLE_PHISHTANK undefined / açık — default feed fallback ────────────

  describe('ENABLE_PHISHTANK undefined veya açıkken default feed kullanılır', () => {
    it('env hiç set edilmemişse public DEFAULT_PHISHTANK_FEED_URL ile fetch yapılır', async () => {
      // ENABLE_PHISHTANK undefined; FEED_URL ve API_KEY de yok
      mockFetchOk([]);

      await checkPhishTank('example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://data.phishtank.com/data/online-valid.json',
        expect.any(Object),
      );
    });

    it('env undefined ve credentials yokken result skipped olmaz', async () => {
      mockFetchOk([]);

      const result = await checkPhishTank('example.com');

      expect(result.skipped).toBe(false);
      expect(result.enabled).toBe(true);
      expect(result.skipReason).toBeUndefined();
    });

    it('ENABLE_PHISHTANK=true ile aynı default feed davranışı', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      mockFetchOk([]);

      await checkPhishTank('example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://data.phishtank.com/data/online-valid.json',
        expect.any(Object),
      );
    });
  });

  // ─── 3. Credentials yok — default feed fallback (ENABLE_PHISHTANK=true) ──────

  describe('credentials yok — default feed fallback', () => {
    it('API key ve feed URL yoksa public DEFAULT_PHISHTANK_FEED_URL kullanılır', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      mockFetchOk([]);

      await checkPhishTank('example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://data.phishtank.com/data/online-valid.json',
        expect.any(Object),
      );
    });

    it('credentials yokken result skipped=false, enabled=true', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      mockFetchOk([]);

      const result = await checkPhishTank('example.com');

      expect(result.skipped).toBe(false);
      expect(result.enabled).toBe(true);
    });

    it('API key olmasa bile FEED_URL varsa skipped olmaz', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
      // API key yok ama FEED_URL var
      mockFetchOk([]);

      const result = await checkPhishTank('example.com');

      expect(result.skipped).toBe(false);
      expect(result.skipReason).toBeUndefined();
    });
  });

  // ─── 3. PHISHTANK_FEED_URL varsa onu kullanır ────────────────────────────────

  describe('PHISHTANK_FEED_URL önceliği', () => {
    it('PHISHTANK_FEED_URL varsa fetch bu URL\'ye gider', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
      mockFetchOk([]);

      await checkPhishTank('example.com');

      expect(global.fetch).toHaveBeenCalledWith(FEED_URL, expect.any(Object));
    });

    it('FEED_URL ve API_KEY ikisi varsa FEED_URL kullanılır', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
      process.env.PHISHTANK_API_KEY = API_KEY;
      mockFetchOk([]);

      await checkPhishTank('example.com');

      expect(global.fetch).toHaveBeenCalledWith(FEED_URL, expect.any(Object));
    });
  });

  // ─── 4. API key varsa URL otomatik kurulur; key result'a sızmaz ──────────────

  describe('PHISHTANK_API_KEY ile URL oluşturma', () => {
    it('API key varsa feed URL key içerecek şekilde kurulur', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_API_KEY = API_KEY;
      mockFetchOk([]);

      await checkPhishTank('example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(API_KEY),
        expect.any(Object),
      );
    });

    it('API key result JSON içinde görünmez', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_API_KEY = API_KEY;
      mockFetchOk([]);

      const result = await checkPhishTank('example.com');

      expect(JSON.stringify(result)).not.toContain(API_KEY);
    });

    it('data.phishtank.com/data/<key>/online-valid.json URL şablonu kullanılır', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_API_KEY = API_KEY;
      mockFetchOk([]);

      await checkPhishTank('example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        `https://data.phishtank.com/data/${API_KEY}/online-valid.json`,
        expect.any(Object),
      );
    });
  });

  // ─── 5. isSameOrSubdomain — pozitif eşleşmeler ───────────────────────────────

  describe('domain eşleştirme — pozitif', () => {
    beforeEach(() => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
    });

    it('exact domain eşleşir', async () => {
      mockFetchOk([makeEntry('http://example.com/login')]);
      const result = await checkPhishTank('example.com');
      expect(result.isListed).toBe(true);
      expect(result.matchedUrls).toHaveLength(1);
    });

    it('www subdomain eşleşir', async () => {
      mockFetchOk([makeEntry('https://www.example.com')]);
      const result = await checkPhishTank('example.com');
      expect(result.isListed).toBe(true);
    });

    it('derin subdomain eşleşir', async () => {
      mockFetchOk([makeEntry('https://sub.example.com/path?q=1')]);
      const result = await checkPhishTank('example.com');
      expect(result.isListed).toBe(true);
    });
  });

  // ─── 5. isSameOrSubdomain — negatif (false positive koruması) ────────────────

  describe('domain eşleştirme — negatif (false positive koruması)', () => {
    beforeEach(() => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
    });

    it('fake-example.com eşleşmez', async () => {
      mockFetchOk([makeEntry('http://fake-example.com')]);
      const result = await checkPhishTank('example.com');
      expect(result.isListed).toBe(false);
    });

    it('example.com.evil.com eşleşmez', async () => {
      mockFetchOk([makeEntry('http://example.com.evil.com')]);
      const result = await checkPhishTank('example.com');
      expect(result.isListed).toBe(false);
    });

    it('evil-example.com eşleşmez', async () => {
      mockFetchOk([makeEntry('http://evil-example.com')]);
      const result = await checkPhishTank('example.com');
      expect(result.isListed).toBe(false);
    });

    it('notexample.com eşleşmez', async () => {
      mockFetchOk([makeEntry('http://notexample.com')]);
      const result = await checkPhishTank('example.com');
      expect(result.isListed).toBe(false);
    });

    it('prefix saldırısı: myexample.com eşleşmez', async () => {
      mockFetchOk([makeEntry('http://myexample.com')]);
      const result = await checkPhishTank('example.com');
      expect(result.isListed).toBe(false);
    });
  });

  // ─── 6. Büyük/küçük harf normalizasyonu ──────────────────────────────────────

  describe('büyük/küçük harf normalizasyonu', () => {
    it('URL hostname büyük harfliyse de eşleşir (URL parser normalizes)', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
      // new URL() normalizes hostname to lowercase
      mockFetchOk([makeEntry('https://Sub.Example.Com/login')]);

      const result = await checkPhishTank('example.com');

      expect(result.isListed).toBe(true);
    });
  });

  // ─── 7. Geçersiz URL handling ────────────────────────────────────────────────

  describe('geçersiz URL handling', () => {
    beforeEach(() => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
    });

    it('bozuk URL string varsa check crash etmez, geçerliler sayılır', async () => {
      mockFetchOk([
        { url: 'not-a-url' },
        { url: '' },
        { url: 'http://' },
        makeEntry('http://example.com/phish'),
      ]);

      const result = await checkPhishTank('example.com');

      expect(result.error).toBeUndefined();
      expect(result.isListed).toBe(true);
      expect(result.matchedUrls).toHaveLength(1);
    });

    it('url alanı eksik entry crash etmez', async () => {
      mockFetchOk([{ phish_id: '1', verified: 'yes', online: 'yes' }]);

      const result = await checkPhishTank('example.com');

      expect(result.error).toBeUndefined();
      expect(result.isListed).toBe(false);
    });

    it('url alanı null entry crash etmez', async () => {
      mockFetchOk([{ phish_id: '1', url: null }]);

      const result = await checkPhishTank('example.com');

      expect(result.error).toBeUndefined();
      expect(result.isListed).toBe(false);
    });
  });

  // ─── 8. Max 20 matched URL ───────────────────────────────────────────────────

  describe('max 20 matched URL limiti', () => {
    it('30 eşleşen entry varsa matchedUrls.length === 20', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
      const entries = Array.from({ length: 30 }, (_, i) =>
        makeEntry(`http://example.com/phish${i}`),
      );
      mockFetchOk(entries);

      const result = await checkPhishTank('example.com');

      expect(result.matchedUrls).toHaveLength(20);
      expect(result.isListed).toBe(true);
    });

    it('eşleşme yoksa matchedUrls boş dizi döner', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
      mockFetchOk([makeEntry('http://other.com/phish')]);

      const result = await checkPhishTank('example.com');

      expect(result.matchedUrls).toHaveLength(0);
      expect(result.isListed).toBe(false);
    });
  });

  // ─── 9. verified / online alanları ───────────────────────────────────────────

  describe('verified ve online sayımları', () => {
    beforeEach(() => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
    });

    it('verified=yes, online=yes → verifiedMatches=2, onlineMatches=1', async () => {
      mockFetchOk([
        makeEntry('http://example.com/a', 'yes', 'yes'),
        makeEntry('http://example.com/b', 'yes', 'no'),
        makeEntry('http://example.com/c', 'no', 'no'),
      ]);

      const result = await checkPhishTank('example.com');

      expect(result.verifiedMatches).toBe(2);
      expect(result.onlineMatches).toBe(1);
      expect(result.isListed).toBe(true);
    });

    it('verified=yes, online=no → verifiedMatches=1, onlineMatches=0', async () => {
      mockFetchOk([makeEntry('http://example.com/phish', 'yes', 'no')]);

      const result = await checkPhishTank('example.com');

      expect(result.verifiedMatches).toBe(1);
      expect(result.onlineMatches).toBe(0);
    });

    it('verified=no, online=no → verifiedMatches=0, onlineMatches=0, isListed=true', async () => {
      mockFetchOk([makeEntry('http://example.com/phish', 'no', 'no')]);

      const result = await checkPhishTank('example.com');

      expect(result.verifiedMatches).toBe(0);
      expect(result.onlineMatches).toBe(0);
      expect(result.isListed).toBe(true);
    });

    it('matchedUrls içinde verified/online boolean olarak taşınır', async () => {
      mockFetchOk([makeEntry('http://example.com/phish', 'yes', 'yes')]);

      const result = await checkPhishTank('example.com');

      expect(result.matchedUrls[0].verified).toBe(true);
      expect(result.matchedUrls[0].online).toBe(true);
      expect(result.matchedUrls[0].url).toBe('http://example.com/phish');
    });

    it('matchedUrls içinde submittedAt taşınır', async () => {
      mockFetchOk([makeEntry('http://example.com/phish')]);

      const result = await checkPhishTank('example.com');

      expect(result.matchedUrls[0].submittedAt).toBe('2026-01-01T00:00:00+00:00');
    });

    it('matchedUrls içinde detailUrl ve verifiedAt taşınır', async () => {
      mockFetchOk([makeEntry('http://example.com/phish', 'yes', 'yes')]);

      const result = await checkPhishTank('example.com');

      expect(result.matchedUrls[0].detailUrl).toBe(
        'https://www.phishtank.com/phish_detail.php?phish_id=42',
      );
      expect(result.matchedUrls[0].verifiedAt).toBe('2026-01-02T00:00:00+00:00');
      expect(result.matchedUrls[0].target).toBe('Example Corp');
    });
  });

  // ─── 10. Provider ────────────────────────────────────────────────────────────

  describe('provider alanı', () => {
    it('provider her zaman phishtank-feed döner', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
      mockFetchOk([]);

      const result = await checkPhishTank('example.com');

      expect(result.provider).toBe('phishtank-feed');
    });
  });

  // ─── 11. Feed cache ──────────────────────────────────────────────────────────

  describe('feed cache', () => {
    it('aynı URL için iki checkPhishTank çağrısında fetch sadece bir kez yapılır', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
      mockFetchOk([makeEntry('http://example.com/phish')]);

      await checkPhishTank('example.com');
      await checkPhishTank('example.com');

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('cache sıfırlandıktan sonra yeni fetch yapılır', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
      mockFetchOk([]);

      await checkPhishTank('example.com');
      _resetFeedCache();
      await checkPhishTank('example.com');

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  // ─── 12. provider error / timeout ────────────────────────────────────────────

  describe('provider error ve timeout', () => {
    beforeEach(() => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
    });

    it('fetch reject olursa error=PHISHTANK_FEED_FAILED, scan patlamaz', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await checkPhishTank('example.com');

      expect(result.error).toBe('PHISHTANK_FEED_FAILED');
      expect(result.skipped).toBe(false);
      expect(result.isListed).toBe(false);
    });

    it('AbortError → error=PHISHTANK_TIMEOUT', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      global.fetch = jest.fn().mockRejectedValue(abortErr);

      const result = await checkPhishTank('example.com');

      expect(result.error).toBe('PHISHTANK_TIMEOUT');
    });

    it('error durumunda enabled=true, skipped=false', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network'));

      const result = await checkPhishTank('example.com');

      expect(result.enabled).toBe(true);
      expect(result.skipped).toBe(false);
    });
  });

  // ─── 13. HTTP non-200 ────────────────────────────────────────────────────────

  describe('HTTP non-200 response', () => {
    beforeEach(() => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
    });

    it('HTTP 500 → error=PHISHTANK_HTTP_500, scan patlamaz', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 } as any);

      const result = await checkPhishTank('example.com');

      expect(result.error).toBe('PHISHTANK_HTTP_500');
      expect(result.skipped).toBe(false);
    });

    it('HTTP 429 → error=PHISHTANK_RATE_LIMITED', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 } as any);

      const result = await checkPhishTank('example.com');

      expect(result.error).toBe('PHISHTANK_RATE_LIMITED');
    });

    it('HTTP 403 → error=PHISHTANK_HTTP_403', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 } as any);

      const result = await checkPhishTank('example.com');

      expect(result.error).toBe('PHISHTANK_HTTP_403');
    });
  });

  // ─── 14. Response parse hatası ───────────────────────────────────────────────

  describe('response parse hatası', () => {
    beforeEach(() => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
    });

    it('JSON parse hatası → error=PHISHTANK_PARSE_ERROR, scan patlamaz', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('invalid json {{{'),
      } as any);

      const result = await checkPhishTank('example.com');

      expect(result.error).toBe('PHISHTANK_PARSE_ERROR');
      expect(result.isListed).toBe(false);
    });

    it('response array değil object → error=PHISHTANK_UNSUPPORTED_FEED_FORMAT', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ not: 'an array' })),
      } as any);

      const result = await checkPhishTank('example.com');

      expect(result.error).toBe('PHISHTANK_UNSUPPORTED_FEED_FORMAT');
    });

    it('response string (array değil) → PHISHTANK_UNSUPPORTED_FEED_FORMAT', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify('not-an-array')),
      } as any);

      const result = await checkPhishTank('example.com');

      expect(result.error).toBe('PHISHTANK_UNSUPPORTED_FEED_FORMAT');
    });
  });

  // ─── result shape ─────────────────────────────────────────────────────────────

  describe('result shape', () => {
    it('başarılı çağrı — tüm zorunlu alanlar dolu', async () => {
      process.env.ENABLE_PHISHTANK = 'true';
      process.env.PHISHTANK_FEED_URL = FEED_URL;
      mockFetchOk([makeEntry('http://example.com/phish', 'yes', 'yes')]);

      const result = await checkPhishTank('example.com');

      expect(result.domain).toBe('example.com');
      expect(result.provider).toBe('phishtank-feed');
      expect(result.enabled).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.error).toBeUndefined();
      expect(typeof result.checkedAt).toBe('string');
      expect(new Date(result.checkedAt).getTime()).not.toBeNaN();
    });

    it('ENABLE_PHISHTANK=false → enabled=false, isListed=false, matchedUrls=[], skipReason=DISABLED', async () => {
      process.env.ENABLE_PHISHTANK = 'false';

      const result = await checkPhishTank('example.com');

      expect(result.enabled).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('DISABLED');
      expect(result.isListed).toBe(false);
      expect(result.verifiedMatches).toBe(0);
      expect(result.onlineMatches).toBe(0);
      expect(result.matchedUrls).toEqual([]);
    });
  });
});
