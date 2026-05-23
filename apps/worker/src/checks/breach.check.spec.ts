import { checkBreachExposure } from './breach.check';

const HIBP_KEY = 'test-key';
const LC_KEY = 'test-key';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

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

function hibpBreaches(
  items: Array<Partial<{ Name: string; BreachDate: string; PwnCount: number; DataClasses: string[] }>> = [],
) {
  return items.map((b) => ({
    Name: b.Name ?? 'TestBreach',
    BreachDate: b.BreachDate ?? '2024-01-01',
    PwnCount: b.PwnCount ?? 1000,
    DataClasses: b.DataClasses ?? ['Email addresses'],
  }));
}

function lcResponse(
  found: number | undefined,
  result: Array<{ sources?: Array<{ name?: string; date?: string; passwordtype?: string }> }> = [],
  success = true,
) {
  const body: Record<string, unknown> = { success, result };
  if (found !== undefined) body.found = found;
  return body;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('checkBreachExposure', () => {
  beforeEach(() => {
    delete process.env.ENABLE_BREACH;
    delete process.env.BREACH_PROVIDER;
    delete process.env.HIBP_API_KEY;
    delete process.env.LEAKCHECK_API_KEY;
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  // ─── 1. ENABLE_BREACH kapalı ─────────────────────────────────────────────

  describe('ENABLE_BREACH kapalı', () => {
    it('env ayarlanmamışsa skipped=true, skipReason=FEATURE_DISABLED, status=skipped', async () => {
      const result = await checkBreachExposure('example.com');

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('FEATURE_DISABLED');
      expect(result.status).toBe('skipped');
    });

    it('ENABLE_BREACH=false → fetch çağrılmaz', async () => {
      process.env.ENABLE_BREACH = 'false';

      await checkBreachExposure('example.com');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('ENABLE_BREACH=false → enabled=false', async () => {
      process.env.ENABLE_BREACH = 'false';

      const result = await checkBreachExposure('example.com');

      expect(result.enabled).toBe(false);
    });

    it('ENABLE_BREACH=false → domain taşınır', async () => {
      process.env.ENABLE_BREACH = 'false';

      const result = await checkBreachExposure('test.com');

      expect(result.domain).toBe('test.com');
    });
  });

  // ─── 2. Mock provider ─────────────────────────────────────────────────────

  describe('BREACH_PROVIDER=mock', () => {
    beforeEach(() => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'mock';
    });

    it('example.com → breachCount=2, exposedEmailsCount=8, status=ok', async () => {
      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('ok');
      expect(result.breachCount).toBe(2);
      expect(result.exposedEmailsCount).toBe(8);
      expect(result.skipped).toBe(false);
      expect(result.enabled).toBe(true);
    });

    it('test-breach.local → breachCount=2, demo breach verisi döner', async () => {
      const result = await checkBreachExposure('test-breach.local');

      expect(result.status).toBe('ok');
      expect(result.breachCount).toBe(2);
    });

    it('temiz domain → breachCount=0, status=ok', async () => {
      const result = await checkBreachExposure('clean-domain.com');

      expect(result.status).toBe('ok');
      expect(result.breachCount).toBe(0);
      expect(result.exposedEmailsCount).toBe(0);
    });

    it('mock provider gerçek internet çağrısı yapmaz', async () => {
      await checkBreachExposure('example.com');
      await checkBreachExposure('clean-domain.com');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('example.com — sensitiveDataTypes normalize edilmiş döner', async () => {
      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('email');
      expect(result.sensitiveDataTypes).toContain('password_hash');
    });

    it('mock provider — provider=mock döner', async () => {
      const result = await checkBreachExposure('example.com');

      expect(result.provider).toBe('mock');
    });

    it('example.com — sources dolu döner', async () => {
      const result = await checkBreachExposure('example.com');

      expect(result.sources.length).toBeGreaterThan(0);
    });

    it('temiz domain — HIBP/LeakCheck çağrılmaz', async () => {
      await checkBreachExposure('another-domain.com');

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── 3. HIBP provider ─────────────────────────────────────────────────────

  describe('BREACH_PROVIDER=hibp', () => {
    beforeEach(() => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'hibp';
    });

    it('HIBP_API_KEY yoksa skipped=true, skipReason=NO_CREDENTIALS, fetch çağrılmaz', async () => {
      const result = await checkBreachExposure('example.com');

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('NO_CREDENTIALS');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('API key varsa doğru endpoint çağrılır', async () => {
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchOk([]);

      await checkBreachExposure('example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v3/breaches?domain=example.com'),
        expect.any(Object),
      );
    });

    it('API key header olarak gönderilir (URL\'ye değil)', async () => {
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchOk([]);

      await checkBreachExposure('example.com');

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain(HIBP_KEY);
      expect((opts.headers as Record<string, string>)['hibp-api-key']).toBe(HIBP_KEY);
    });

    it('boş breach listesi → status=ok, breachCount=0', async () => {
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchOk([]);

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('ok');
      expect(result.breachCount).toBe(0);
    });

    it('breach listesi doluysa doğru parse edilir', async () => {
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchOk(hibpBreaches([
        { Name: 'Adobe', BreachDate: '2013-10-04', PwnCount: 153000000, DataClasses: ['Email addresses', 'Passwords'] },
        { Name: 'LinkedIn', BreachDate: '2012-05-05', PwnCount: 164611595, DataClasses: ['Email addresses', 'Usernames'] },
      ]));

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('ok');
      expect(result.breachCount).toBe(2);
      expect(result.sources).toContain('Adobe');
      expect(result.sources).toContain('LinkedIn');
    });

    it('API key result JSON içine sızmaz', async () => {
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchOk([]);

      const result = await checkBreachExposure('example.com');

      expect(JSON.stringify(result)).not.toContain(HIBP_KEY);
    });

    it('HIBP 401 → status=error, error=HIBP_UNAUTHORIZED', async () => {
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchJson(401, {});

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('error');
      expect(result.error).toBe('HIBP_UNAUTHORIZED');
    });

    it('HIBP 429 → status=error, error=HIBP_RATE_LIMITED', async () => {
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchJson(429, {});

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('error');
      expect(result.error).toBe('HIBP_RATE_LIMITED');
    });

    it('HIBP 500 → status=error, error=HIBP_HTTP_500', async () => {
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchJson(500, {});

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('error');
      expect(result.error).toBe('HIBP_HTTP_500');
    });

    it('fetch reject → status=error, error=HIBP_REQUEST_FAILED, scan patlamaz', async () => {
      process.env.HIBP_API_KEY = HIBP_KEY;
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('error');
      expect(result.error).toBe('HIBP_REQUEST_FAILED');
    });

    it('AbortError → status=error, error=HIBP_TIMEOUT', async () => {
      process.env.HIBP_API_KEY = HIBP_KEY;
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      global.fetch = jest.fn().mockRejectedValue(abortErr);

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('error');
      expect(result.error).toBe('HIBP_TIMEOUT');
    });

    it('hata durumunda Promise resolve olur, scan patlamaz', async () => {
      process.env.HIBP_API_KEY = HIBP_KEY;
      global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

      await expect(checkBreachExposure('example.com')).resolves.toBeDefined();
    });
  });

  // ─── 4. HIBP DataClasses normalization ───────────────────────────────────

  describe('HIBP DataClasses normalization', () => {
    beforeEach(() => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'hibp';
      process.env.HIBP_API_KEY = HIBP_KEY;
    });

    it('"Email addresses" → "email"', async () => {
      mockFetchOk(hibpBreaches([{ DataClasses: ['Email addresses'] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('email');
    });

    it('"Passwords" → "password"', async () => {
      mockFetchOk(hibpBreaches([{ DataClasses: ['Passwords'] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('password');
    });

    it('"Password hints" → "password_hint"', async () => {
      mockFetchOk(hibpBreaches([{ DataClasses: ['Password hints'] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('password_hint');
    });

    it('"Usernames" → "username"', async () => {
      mockFetchOk(hibpBreaches([{ DataClasses: ['Usernames'] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('username');
    });

    it('"Phone numbers" → "phone"', async () => {
      mockFetchOk(hibpBreaches([{ DataClasses: ['Phone numbers'] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('phone');
    });

    it('"Credit cards" → "credit_card"', async () => {
      mockFetchOk(hibpBreaches([{ DataClasses: ['Credit cards'] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('credit_card');
    });

    it('bilinmeyen DataClass crash ettirmez — lowercase+underscore normalize edilir', async () => {
      mockFetchOk(hibpBreaches([{ DataClasses: ['Some Unknown Data Type'] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('ok');
      expect(result.sensitiveDataTypes).toContain('some_unknown_data_type');
    });

    it('birden fazla breach — DataClasses deduplicate edilir', async () => {
      mockFetchOk([
        { Name: 'B1', BreachDate: '2023-01-01', PwnCount: 100, DataClasses: ['Email addresses', 'Passwords'] },
        { Name: 'B2', BreachDate: '2024-01-01', PwnCount: 200, DataClasses: ['Email addresses', 'Usernames'] },
      ]);

      const result = await checkBreachExposure('example.com');

      const emailCount = result.sensitiveDataTypes.filter((t) => t === 'email').length;
      expect(emailCount).toBe(1);
      expect(result.sensitiveDataTypes).toContain('password');
      expect(result.sensitiveDataTypes).toContain('username');
    });

    it('latestBreachDate — birden fazla tarih arasından en yenisi seçilir', async () => {
      mockFetchOk([
        { Name: 'B1', BreachDate: '2020-01-01', PwnCount: 100, DataClasses: [] },
        { Name: 'B2', BreachDate: '2024-06-15', PwnCount: 200, DataClasses: [] },
        { Name: 'B3', BreachDate: '2022-03-10', PwnCount: 50,  DataClasses: [] },
      ]);

      const result = await checkBreachExposure('example.com');

      expect(result.latestBreachDate).toContain('2024');
    });

    it('exposedEmailsCount — tüm PwnCount değerlerinin toplamı', async () => {
      mockFetchOk([
        { Name: 'B1', BreachDate: '2020-01-01', PwnCount: 100, DataClasses: [] },
        { Name: 'B2', BreachDate: '2024-06-15', PwnCount: 200, DataClasses: [] },
      ]);

      const result = await checkBreachExposure('example.com');

      expect(result.exposedEmailsCount).toBe(300);
    });

    it('raw HIBP DataClass stringleri sensitiveDataTypes içinde görünmez (normalize edilir)', async () => {
      mockFetchOk(hibpBreaches([{ DataClasses: ['Passwords', 'Email addresses'] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).not.toContain('Passwords');
      expect(result.sensitiveDataTypes).not.toContain('Email addresses');
      expect(result.sensitiveDataTypes).toContain('password');
      expect(result.sensitiveDataTypes).toContain('email');
    });
  });

  // ─── 5. LeakCheck provider ───────────────────────────────────────────────

  describe('BREACH_PROVIDER=leakcheck', () => {
    beforeEach(() => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'leakcheck';
    });

    it('LEAKCHECK_API_KEY yoksa skipped=true, skipReason=NO_CREDENTIALS, fetch çağrılmaz', async () => {
      const result = await checkBreachExposure('example.com');

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('NO_CREDENTIALS');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('API key varsa doğru endpoint çağrılır', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(0, []));

      await checkBreachExposure('example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('leakcheck.io'),
        expect.any(Object),
      );
    });

    it('API key header olarak gönderilir (URL\'ye değil)', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(0, []));

      await checkBreachExposure('example.com');

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain(LC_KEY);
      expect((opts.headers as Record<string, string>)['X-API-Key']).toBe(LC_KEY);
    });

    it('success=false → makeClean, status=ok, breachCount=0', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(0, [], false));

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('ok');
      expect(result.breachCount).toBe(0);
    });

    it('result boş dizi → status=ok, breachCount=0', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(0, []));

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('ok');
      expect(result.breachCount).toBe(0);
    });

    it('başarılı response — breachCount=unique source sayısı', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(500, [
        { sources: [{ name: 'Breach1', date: '2023-01', passwordtype: 'plaintext' }] },
        { sources: [{ name: 'Breach2', date: '2024-05', passwordtype: 'hash' }] },
      ]));

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('ok');
      expect(result.breachCount).toBe(2);
      expect(result.exposedEmailsCount).toBe(500);
    });

    it('found field varsa exposedEmailsCount=found değeri olur', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(1234, [{ sources: [{ name: 'TestBreach' }] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.exposedEmailsCount).toBe(1234);
    });

    it('found yoksa exposedEmailsCount=result.length olur', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      // found: undefined (not sent)
      mockFetchOk(lcResponse(undefined, [
        { sources: [{ name: 'B1' }] },
        { sources: [{ name: 'B2' }] },
        { sources: [{ name: 'B3' }] },
      ]));

      const result = await checkBreachExposure('example.com');

      expect(result.exposedEmailsCount).toBe(3);
    });

    it('passwordtype="plaintext" → sensitiveDataTypes içinde "password" olur', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(10, [{ sources: [{ name: 'B1', passwordtype: 'plaintext' }] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('password');
      expect(result.sensitiveDataTypes).not.toContain('plaintext');
    });

    it('passwordtype="hash" → sensitiveDataTypes içinde "password_hash" olur', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(10, [{ sources: [{ name: 'B1', passwordtype: 'hash' }] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('password_hash');
    });

    it('passwordtype="bcrypt" (non-plaintext) → "password_hash" olur', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(10, [{ sources: [{ name: 'B1', passwordtype: 'bcrypt' }] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('password_hash');
    });

    it('domain sorguları her zaman "email" tipini içerir', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(10, [{ sources: [{ name: 'B1' }] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('email');
    });

    it('API key result JSON içine sızmaz', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(0, []));

      const result = await checkBreachExposure('example.com');

      expect(JSON.stringify(result)).not.toContain(LC_KEY);
    });

    it('HTTP 401 → status=error, error=LEAKCHECK_UNAUTHORIZED', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchJson(401, {});

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('error');
      expect(result.error).toBe('LEAKCHECK_UNAUTHORIZED');
    });

    it('HTTP 403 → status=error, error=LEAKCHECK_UNAUTHORIZED', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchJson(403, {});

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('error');
      expect(result.error).toBe('LEAKCHECK_UNAUTHORIZED');
    });

    it('HTTP 429 → status=error, error=LEAKCHECK_RATE_LIMITED', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchJson(429, {});

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('error');
      expect(result.error).toBe('LEAKCHECK_RATE_LIMITED');
    });

    it('HTTP 500 → status=error, error=LEAKCHECK_HTTP_500', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchJson(500, {});

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('error');
      expect(result.error).toBe('LEAKCHECK_HTTP_500');
    });

    it('fetch reject → status=error, error=LEAKCHECK_REQUEST_FAILED, scan patlamaz', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('error');
      expect(result.error).toBe('LEAKCHECK_REQUEST_FAILED');
    });

    it('AbortError → status=error, error=LEAKCHECK_TIMEOUT', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      global.fetch = jest.fn().mockRejectedValue(abortErr);

      const result = await checkBreachExposure('example.com');

      expect(result.status).toBe('error');
      expect(result.error).toBe('LEAKCHECK_TIMEOUT');
    });

    it('hata durumunda Promise resolve olur, scan patlamaz', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

      await expect(checkBreachExposure('example.com')).resolves.toBeDefined();
    });

    it('latestBreachDate — YYYY-MM formatı ISO string üretir', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(10, [{ sources: [{ name: 'B1', date: '2024-03' }] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.latestBreachDate).not.toBeNull();
      expect(result.latestBreachDate).toContain('2024');
    });

    it('birden fazla tarih — en yenisi latestBreachDate olur', async () => {
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(50, [
        { sources: [{ name: 'B1', date: '2021-05' }, { name: 'B2', date: '2024-11' }] },
        { sources: [{ name: 'B3', date: '2019-01' }] },
      ]));

      const result = await checkBreachExposure('example.com');

      expect(result.latestBreachDate).toContain('2024');
    });
  });

  // ─── 6. Provider seçimi ───────────────────────────────────────────────────

  describe('provider seçimi', () => {
    beforeEach(() => {
      process.env.ENABLE_BREACH = 'true';
    });

    it('BREACH_PROVIDER=mock → fetch çağrılmaz', async () => {
      process.env.BREACH_PROVIDER = 'mock';

      await checkBreachExposure('example.com');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('BREACH_PROVIDER=hibp → sadece HIBP endpoint çağrılır', async () => {
      process.env.BREACH_PROVIDER = 'hibp';
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchOk([]);

      await checkBreachExposure('example.com');

      const calls = (global.fetch as jest.Mock).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0] as string).toContain('haveibeenpwned.com');
    });

    it('BREACH_PROVIDER=leakcheck → sadece LeakCheck endpoint çağrılır', async () => {
      process.env.BREACH_PROVIDER = 'leakcheck';
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(0, []));

      await checkBreachExposure('example.com');

      const calls = (global.fetch as jest.Mock).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0] as string).toContain('leakcheck.io');
    });

    it('BREACH_PROVIDER bilinmeyen değer → skipped=true, skipReason=UNKNOWN_PROVIDER, fetch çağrılmaz', async () => {
      process.env.BREACH_PROVIDER = 'unknown-provider';

      const result = await checkBreachExposure('example.com');

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('UNKNOWN_PROVIDER');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('BREACH_PROVIDER ayarlanmamış → varsayılan mock, provider=mock, fetch yok', async () => {
      const result = await checkBreachExposure('clean.com');

      expect(result.provider).toBe('mock');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('BREACH_PROVIDER=hibp → LeakCheck endpoint çağrılmaz', async () => {
      process.env.BREACH_PROVIDER = 'hibp';
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchOk([]);

      await checkBreachExposure('example.com');

      const urls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes('leakcheck'))).toBe(false);
    });

    it('BREACH_PROVIDER=leakcheck → HIBP endpoint çağrılmaz', async () => {
      process.env.BREACH_PROVIDER = 'leakcheck';
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(0, []));

      await checkBreachExposure('example.com');

      const urls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes('haveibeenpwned'))).toBe(false);
    });
  });

  // ─── 7. Result shape ─────────────────────────────────────────────────────

  describe('result shape', () => {
    it('başarılı mock result — zorunlu alanlar dolu ve doğru tipte', async () => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'mock';

      const result = await checkBreachExposure('example.com');

      expect(result.domain).toBe('example.com');
      expect(typeof result.provider).toBe('string');
      expect(['ok', 'skipped', 'error']).toContain(result.status);
      expect(typeof result.skipped).toBe('boolean');
      expect(typeof result.enabled).toBe('boolean');
      expect(typeof result.breachCount).toBe('number');
      expect(Array.isArray(result.sources)).toBe(true);
      expect(Array.isArray(result.sensitiveDataTypes)).toBe(true);
      expect(typeof result.checkedAt).toBe('string');
      expect(new Date(result.checkedAt).getTime()).not.toBeNaN();
    });

    it('skipped result — credential alanları taşımaz', async () => {
      const result = await checkBreachExposure('example.com');
      const json = JSON.stringify(result);

      expect(json).not.toContain('apiKey');
      expect(json).not.toContain('api_key');
      expect(json).not.toContain('secret');
    });

    it('error result — zorunlu alanlar dolu, error string olarak taşınır', async () => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'hibp';
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchJson(500, {});

      const result = await checkBreachExposure('example.com');

      expect(result.domain).toBe('example.com');
      expect(result.status).toBe('error');
      expect(typeof result.error).toBe('string');
      expect(result.breachCount).toBe(0);
      expect(Array.isArray(result.sources)).toBe(true);
      expect(Array.isArray(result.sensitiveDataTypes)).toBe(true);
    });

    it('HIBP result JSON — ham API key görünmez', async () => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'hibp';
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchOk([]);

      const result = await checkBreachExposure('example.com');

      expect(JSON.stringify(result)).not.toContain(HIBP_KEY);
    });

    it('LeakCheck result JSON — ham API key görünmez', async () => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'leakcheck';
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(0, []));

      const result = await checkBreachExposure('example.com');

      expect(JSON.stringify(result)).not.toContain(LC_KEY);
    });
  });

  // ─── 8. Sensitive data leak ───────────────────────────────────────────────

  describe('sensitive data leak', () => {
    it('LeakCheck passwordtype "plaintext" — ham değer sensitiveDataTypes\'a girmez, "password" normalize edilir', async () => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'leakcheck';
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(5, [{ sources: [{ name: 'B1', passwordtype: 'plaintext' }] }]));

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).not.toContain('plaintext');
      expect(result.sensitiveDataTypes).toContain('password');
    });

    it('HIBP Passwords/Email addresses — raw HIBP stringleri sanitize edilir, normalize form döner', async () => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'hibp';
      process.env.HIBP_API_KEY = HIBP_KEY;
      mockFetchOk([{
        Name: 'TestBreach',
        BreachDate: '2024-01-01',
        PwnCount: 1000,
        DataClasses: ['Passwords', 'Email addresses'],
      }]);

      const result = await checkBreachExposure('example.com');

      expect(result.sensitiveDataTypes).toContain('password');
      expect(result.sensitiveDataTypes).toContain('email');
      expect(result.sensitiveDataTypes).not.toContain('Passwords');
      expect(result.sensitiveDataTypes).not.toContain('Email addresses');
    });

    it('LeakCheck result — ham credential benzeri alanlar result JSON\'a taşınmaz', async () => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'leakcheck';
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      mockFetchOk(lcResponse(1, [{ sources: [{ name: 'TestBreach', passwordtype: 'plaintext' }] }]));

      const result = await checkBreachExposure('example.com');
      const resultStr = JSON.stringify(result);

      expect(resultStr).not.toContain('LEAKCHECK_API_KEY');
      expect(resultStr).not.toContain(LC_KEY);
    });
  });

  // ─── 9. Timeout / timer cleanup ──────────────────────────────────────────

  describe('timeout / timer cleanup', () => {
    it('HIBP AbortError — promise resolve olur, HIBP_TIMEOUT error ile', async () => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'hibp';
      process.env.HIBP_API_KEY = HIBP_KEY;
      const abortErr = Object.assign(new Error('timeout'), { name: 'AbortError' });
      global.fetch = jest.fn().mockRejectedValue(abortErr);

      await expect(checkBreachExposure('example.com')).resolves.toMatchObject({
        status: 'error',
        error: 'HIBP_TIMEOUT',
      });
    });

    it('LeakCheck AbortError — promise resolve olur, LEAKCHECK_TIMEOUT error ile', async () => {
      process.env.ENABLE_BREACH = 'true';
      process.env.BREACH_PROVIDER = 'leakcheck';
      process.env.LEAKCHECK_API_KEY = LC_KEY;
      const abortErr = Object.assign(new Error('timeout'), { name: 'AbortError' });
      global.fetch = jest.fn().mockRejectedValue(abortErr);

      await expect(checkBreachExposure('example.com')).resolves.toMatchObject({
        status: 'error',
        error: 'LEAKCHECK_TIMEOUT',
      });
    });
  });
});
