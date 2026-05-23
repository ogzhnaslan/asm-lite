import { checkSqli, type SqliAssetInput } from './sqli.check';
import { SQLI_PAYLOADS } from './sqli/payloads';
import { matchSqlError } from './sqli/detectors';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const verifiedDomain: SqliAssetInput = {
  id: 'asset-1', type: 'DOMAIN', value: 'example.com', status: 'VERIFIED',
};
const pendingDomain: SqliAssetInput = { ...verifiedDomain, status: 'PENDING' };
const verifiedIp: SqliAssetInput = { ...verifiedDomain, type: 'IP', value: '1.2.3.4' };

function makeTarget(overrides: Partial<{
  id: string; path: string; paramsJson: Record<string, string>; injectParam: string;
}> = {}) {
  return {
    id: 't-1',
    path: '/product',
    paramsJson: { id: '1' },
    injectParam: 'id',
    ...overrides,
  };
}

function makePrisma(targets: ReturnType<typeof makeTarget>[]) {
  return {
    sqliTarget: {
      findMany: jest.fn().mockResolvedValue(targets),
    },
  } as any;
}

interface FetchMock {
  status?: number;
  body?: string;
  error?: { name?: string; code?: string; message?: string };
}

function setupFetchSequence(responses: FetchMock[]) {
  const queue = [...responses];
  global.fetch = jest.fn().mockImplementation(() => {
    const next = queue.shift();
    if (!next) {
      // Default: empty 200 (matches baseline) — keeps the test deterministic
      // even if the orchestrator issues more requests than the test expected.
      return Promise.resolve({ status: 200, text: () => Promise.resolve('') } as any);
    }
    if (next.error) {
      const err: Error & { code?: string } = new Error(next.error.message ?? 'network');
      if (next.error.name) err.name = next.error.name;
      if (next.error.code) err.code = next.error.code;
      return Promise.reject(err);
    }
    return Promise.resolve({
      status: next.status ?? 200,
      text: () => Promise.resolve(next.body ?? ''),
    } as any);
  });
}

function alwaysFetch(response: FetchMock) {
  global.fetch = jest.fn().mockImplementation(() => {
    if (response.error) {
      const err: Error & { code?: string } = new Error(response.error.message ?? 'network');
      if (response.error.name) err.name = response.error.name;
      if (response.error.code) err.code = response.error.code;
      return Promise.reject(err);
    }
    return Promise.resolve({
      status: response.status ?? 200,
      text: () => Promise.resolve(response.body ?? ''),
    } as any);
  });
}

const BASELINE_BODY = 'x'.repeat(10_000);                // 10 KB safe body
const PROBE_SMALL_DELTA = 'x'.repeat(10_050);            // +50 bytes (sub-threshold)
const PROBE_LARGE_DELTA = 'x'.repeat(5_000);             // -5 KB (50% drop, well over 5% + 200B)

// Typical PHP+MySQL error body — matches /SQL syntax.*MySQL/i regex
const MYSQL_ERROR_BODY = 'You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near \'\' at line 1';

// Real-world MariaDB+PHP body — Sprint E smoke test'inde gözlemlenen pattern
// (mysqli_sql_exception + MariaDB server version + universal "You have an error" prefix)
const MARIADB_ERROR_BODY =
  'Fatal error: Uncaught mysqli_sql_exception: You have an error in your SQL syntax; ' +
  'check the manual that corresponds to your MariaDB server version for the right syntax to use near \'\\\'\' at line 1 ' +
  'in /var/www/html/sqli-lab/product.php:23';

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('checkSqli', () => {
  beforeEach(() => {
    delete process.env.ENABLE_SQLI_CHECK;
    process.env.SQLI_REQUEST_DELAY_MS = '0';            // tests don't need real delay
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  // ─── 1. Guard tests ────────────────────────────────────────────────────────

  describe('guards', () => {
    it('ENABLE_SQLI_CHECK !== true → skipReason DISABLED', async () => {
      const result = await checkSqli(makePrisma([]), verifiedDomain);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('DISABLED');
      expect(result.enabled).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('IP asset → skipReason NOT_DOMAIN (enabled true)', async () => {
      process.env.ENABLE_SQLI_CHECK = 'true';
      const result = await checkSqli(makePrisma([]), verifiedIp);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('NOT_DOMAIN');
      expect(result.enabled).toBe(true);
    });

    it('PENDING asset → skipReason NOT_VERIFIED', async () => {
      process.env.ENABLE_SQLI_CHECK = 'true';
      const result = await checkSqli(makePrisma([]), pendingDomain);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('NOT_VERIFIED');
    });

    it('hiç target yoksa → skipReason NO_TARGETS', async () => {
      process.env.ENABLE_SQLI_CHECK = 'true';
      const result = await checkSqli(makePrisma([]), verifiedDomain);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('NO_TARGETS');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── 2. Detection ──────────────────────────────────────────────────────────

  describe('detection', () => {
    beforeEach(() => { process.env.ENABLE_SQLI_CHECK = 'true'; });

    it('safe endpoint (baseline + tüm probe\'lar aynı 200 body) → suspected=false', async () => {
      alwaysFetch({ status: 200, body: BASELINE_BODY });
      const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

      expect(result.skipped).toBe(false);
      expect(result.targetCount).toBe(1);
      expect(result.suspectedCount).toBe(0);
      expect(result.results[0].suspected).toBe(false);
      expect(result.results[0].risk).toBeNull();
    });

    it('SQL error body → SQL_ERROR_PATTERN signal, suspected=true', async () => {
      // baseline (safe) + ilk probe (SQL error) + tüm sonraki probe'lar (safe) + confirmation (SQL error)
      const fetchResponses: FetchMock[] = [
        { status: 200, body: BASELINE_BODY },           // baseline
        { status: 200, body: MYSQL_ERROR_BODY },        // sql_quote → error pattern
        ...Array(SQLI_PAYLOADS.length - 1).fill({ status: 200, body: BASELINE_BODY }),
        { status: 200, body: MYSQL_ERROR_BODY },        // confirmation retry — still error
      ];
      setupFetchSequence(fetchResponses);

      const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

      expect(result.results[0].suspected).toBe(true);
      expect(result.results[0].signals).toContain('SQL_ERROR_PATTERN');
      expect(result.results[0].evidence.matchedErrorPattern).toBe('mysql');
      expect(result.results[0].evidence.matchedErrorSnippet).toContain('SQL syntax');
      expect(result.results[0].payloadId).toBe('sql_quote');
    });

    it('payload status 500 → STATUS_CODE_5XX signal', async () => {
      const fetchResponses: FetchMock[] = [
        { status: 200, body: BASELINE_BODY },           // baseline
        { status: 500, body: 'Internal Server Error' }, // sql_quote
        ...Array(SQLI_PAYLOADS.length - 1).fill({ status: 200, body: BASELINE_BODY }),
      ];
      setupFetchSequence(fetchResponses);

      const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

      expect(result.results[0].signals).toContain('STATUS_CODE_5XX');
      expect(result.results[0].signals).toContain('STATUS_CODE_CHANGED');
      expect(result.results[0].suspected).toBe(true);
    });

    it('küçük body length farkı → BODY_LENGTH_DELTA YOK (false positive guard)', async () => {
      alwaysFetch({ status: 200, body: BASELINE_BODY });
      // Manuel override: ilk fetch baseline, sonrakiler küçük delta (50 byte)
      const fetchResponses: FetchMock[] = [
        { status: 200, body: BASELINE_BODY },
        ...Array(SQLI_PAYLOADS.length).fill({ status: 200, body: PROBE_SMALL_DELTA }),
      ];
      setupFetchSequence(fetchResponses);

      const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

      expect(result.results[0].signals).not.toContain('BODY_LENGTH_DELTA');
    });

    it('büyük body length farkı → BODY_LENGTH_DELTA signal', async () => {
      const fetchResponses: FetchMock[] = [
        { status: 200, body: BASELINE_BODY },           // baseline 10KB
        ...Array(SQLI_PAYLOADS.length).fill({ status: 200, body: PROBE_LARGE_DELTA }), // 5KB (50% diff)
      ];
      setupFetchSequence(fetchResponses);

      const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

      expect(result.results[0].signals).toContain('BODY_LENGTH_DELTA');
      expect(result.results[0].suspected).toBe(true);
    });

    it('boolean TRUE vs FALSE body farkı → BOOLEAN_TRUE_FALSE_DELTA signal', async () => {
      // Tüm probe'lar baseline ile aynı (signal yok), AMA boolean_true ve
      // boolean_false birbirinden büyük farkla ayrılıyor. Cross-payload check.
      const indexOfTrue = SQLI_PAYLOADS.findIndex((p) => p.category === 'boolean_true');
      const indexOfFalse = SQLI_PAYLOADS.findIndex((p) => p.category === 'boolean_false');

      const fetchResponses: FetchMock[] = [];
      fetchResponses.push({ status: 200, body: BASELINE_BODY }); // baseline
      for (let i = 0; i < SQLI_PAYLOADS.length; i++) {
        if (i === indexOfTrue) fetchResponses.push({ status: 200, body: 'x'.repeat(20_000) });   // big
        else if (i === indexOfFalse) fetchResponses.push({ status: 200, body: 'x'.repeat(5_000) }); // small
        else fetchResponses.push({ status: 200, body: BASELINE_BODY });
      }
      setupFetchSequence(fetchResponses);

      const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

      expect(result.results[0].signals).toContain('BOOLEAN_TRUE_FALSE_DELTA');
      expect(result.results[0].suspected).toBe(true);
    });

    it('probe network error → SQLi sinyali sayılmaz (suspected=false)', async () => {
      const fetchResponses: FetchMock[] = [
        { status: 200, body: BASELINE_BODY },                                            // baseline OK
        ...Array(SQLI_PAYLOADS.length).fill({ error: { code: 'ECONNRESET' } }),          // tüm probe'lar fail
      ];
      setupFetchSequence(fetchResponses);

      const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

      expect(result.results[0].suspected).toBe(false);
      expect(result.results[0].signals).toEqual([]);
    });

    it('baseline timeout → networkError TIMEOUT, suspected=false', async () => {
      alwaysFetch({ error: { name: 'AbortError' } });

      const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

      expect(result.results[0].suspected).toBe(false);
      expect(result.results[0].evidence.networkError).toBe('TIMEOUT');
    });
  });

  // ─── 3. Confirmation + risk + limits ───────────────────────────────────────

  describe('confirmation, risk, limits', () => {
    beforeEach(() => { process.env.ENABLE_SQLI_CHECK = 'true'; });

    it('SQL_ERROR_PATTERN tetiklenirse confirmation request gönderilir (ek 1 fetch)', async () => {
      const fetchResponses: FetchMock[] = [
        { status: 200, body: BASELINE_BODY },           // baseline
        { status: 200, body: MYSQL_ERROR_BODY },        // sql_quote — error
        ...Array(SQLI_PAYLOADS.length - 1).fill({ status: 200, body: BASELINE_BODY }),
        { status: 200, body: MYSQL_ERROR_BODY },        // confirmation retry
      ];
      setupFetchSequence(fetchResponses);

      await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

      // 1 baseline + N payload + 1 confirmation = N + 2
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(SQLI_PAYLOADS.length + 2);
    });

    it('confirmed=true + STATUS_CODE_5XX + SQL_ERROR_PATTERN → CRITICAL risk', async () => {
      // sql_quote → 500 + error body; confirmation → 500 + error body
      const fetchResponses: FetchMock[] = [
        { status: 200, body: BASELINE_BODY },           // baseline
        { status: 500, body: MYSQL_ERROR_BODY },        // probe — strong signal
        ...Array(SQLI_PAYLOADS.length - 1).fill({ status: 200, body: BASELINE_BODY }),
        { status: 500, body: MYSQL_ERROR_BODY },        // confirmation
      ];
      setupFetchSequence(fetchResponses);

      const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

      expect(result.results[0].confirmed).toBe(true);
      expect(result.results[0].risk).toBe('CRITICAL');
      expect(result.results[0].aiScore).toBe(95);
    });

    it('confirmation başarısızsa risk HIGH\'ta kalır (CRITICAL\'a çıkmaz)', async () => {
      const fetchResponses: FetchMock[] = [
        { status: 200, body: BASELINE_BODY },           // baseline
        { status: 500, body: MYSQL_ERROR_BODY },        // probe — strong signal
        ...Array(SQLI_PAYLOADS.length - 1).fill({ status: 200, body: BASELINE_BODY }),
        { status: 500, body: 'no engine sig' },         // confirmation — error body yok, sadece 5xx
      ];
      setupFetchSequence(fetchResponses);

      const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

      expect(result.results[0].confirmed).toBe(false);
      expect(result.results[0].risk).toBe('HIGH');
    });

    it('worker tarafında DB.findMany take: 5 ile çağrılır (defansif limit)', async () => {
      const prisma = makePrisma([]);
      await checkSqli(prisma, verifiedDomain);

      expect(prisma.sqliTarget.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 5,
        where: expect.objectContaining({ assetId: 'asset-1', enabled: true }),
      }));
    });

    it('birden fazla target sıralı olarak işlenir', async () => {
      alwaysFetch({ status: 200, body: BASELINE_BODY });
      const targets = [
        makeTarget({ id: 't-1', path: '/a', paramsJson: { x: '1' }, injectParam: 'x' }),
        makeTarget({ id: 't-2', path: '/b', paramsJson: { y: '2' }, injectParam: 'y' }),
      ];
      const result = await checkSqli(makePrisma(targets), verifiedDomain);

      expect(result.targetCount).toBe(2);
      expect(result.testedParams).toBe(2);
      expect(result.results.map((r) => r.targetId)).toEqual(['t-1', 't-2']);
    });
  });

  // ─── 4. MariaDB / mysqli_sql_exception detection (Sprint E follow-up) ─────
  // Real-world smoke test sırasında MariaDB+PHP stack'inden gelen body'lerde
  // SQL_ERROR_PATTERN üretilemiyordu (sadece BODY_LENGTH_DELTA → LOW risk).
  // Bu testler eklenen MariaDB / mysqli_sql_exception / universal "You have an
  // error in your SQL syntax" pattern'lerinin doğru engine atadığını ve risk'in
  // HIGH'a yükseldiğini doğrular.

  describe('MariaDB / mysqli_sql_exception pattern detection', () => {
    describe('matchSqlError unit', () => {
      it('"mysqli_sql_exception" içeren body → engine=mysql', () => {
        const body = 'Fatal error: Uncaught mysqli_sql_exception: ...';
        const m = matchSqlError(body);
        expect(m).not.toBeNull();
        expect(m!.engine).toBe('mysql');
      });

      it('"You have an error in your SQL syntax" (engine adı olmadan) → engine=mysql', () => {
        const body = 'You have an error in your SQL syntax at line 1';
        const m = matchSqlError(body);
        expect(m).not.toBeNull();
        expect(m!.engine).toBe('mysql');
      });

      it('"MariaDB server version" içeren body → engine=mariadb', () => {
        const body = 'check the manual that corresponds to your MariaDB server version';
        const m = matchSqlError(body);
        expect(m).not.toBeNull();
        expect(m!.engine).toBe('mariadb');
      });

      it('SQL syntax.*MariaDB pattern → engine=mariadb', () => {
        const body = 'You have an error in your SQL syntax; corresponds to your MariaDB';
        const m = matchSqlError(body);
        expect(m).not.toBeNull();
        expect(m!.engine).toBe('mariadb');
      });

      it('Karışık body (mysqli + MariaDB) → MariaDB önce eşleşir (engine=mariadb)', () => {
        // Smoke test'teki gerçek body
        const m = matchSqlError(MARIADB_ERROR_BODY);
        expect(m).not.toBeNull();
        expect(m!.engine).toBe('mariadb');
        expect(m!.snippet).toContain('SQL syntax');
      });

      it('Pure MySQL body (MySQL kelimesi açık) → engine=mysql', () => {
        const m = matchSqlError(MYSQL_ERROR_BODY);
        expect(m).not.toBeNull();
        expect(m!.engine).toBe('mysql');
      });
    });

    describe('orchestrator integration', () => {
      beforeEach(() => { process.env.ENABLE_SQLI_CHECK = 'true'; });

      it('MariaDB smoke body → SQL_ERROR_PATTERN signal + suspected=true + risk=HIGH', async () => {
        // sql_quote payload MariaDB hata mesajı döndürür; sonraki payload'lar safe;
        // confirmation da MariaDB body döner → confirmed=true.
        // Body'leri benzer boyutta tut → BODY_LENGTH_DELTA tetiklenmesin →
        // sinyal sadece SQL_ERROR_PATTERN, risk HIGH (CRITICAL'e çıkmaz).
        const mariaPadded = MARIADB_ERROR_BODY + 'x'.repeat(10_000 - MARIADB_ERROR_BODY.length);
        const fetchResponses: FetchMock[] = [
          { status: 200, body: BASELINE_BODY },               // baseline (10 KB)
          { status: 200, body: mariaPadded },                 // sql_quote → SQL_ERROR_PATTERN, body delta <%5
          ...Array(SQLI_PAYLOADS.length - 1).fill({ status: 200, body: BASELINE_BODY }),
          { status: 200, body: mariaPadded },                 // confirmation retry
        ];
        setupFetchSequence(fetchResponses);

        const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

        expect(result.results[0].suspected).toBe(true);
        expect(result.results[0].signals).toContain('SQL_ERROR_PATTERN');
        expect(result.results[0].signals).not.toContain('BODY_LENGTH_DELTA');
        expect(result.results[0].evidence.matchedErrorPattern).toBe('mariadb');
        expect(result.results[0].evidence.matchedErrorSnippet).toContain('SQL syntax');
        expect(result.results[0].confirmed).toBe(true);
        // SQL_ERROR_PATTERN tek başına HIGH (5xx ve büyük body delta yok)
        expect(result.results[0].risk).toBe('HIGH');
        expect(result.results[0].aiScore).toBe(85);
      });

      it('MariaDB body + büyük body delta + confirmation → CRITICAL risk', async () => {
        // Gerçek smoke test scenario'ya yakın: SQL hata mesajı + cevap body
        // anlamlı şekilde küçülmüş + confirmation başarılı → CRITICAL
        const fetchResponses: FetchMock[] = [
          { status: 200, body: BASELINE_BODY },               // baseline 10KB
          { status: 200, body: MARIADB_ERROR_BODY },          // sql_quote → ~400 byte MariaDB error (büyük delta)
          ...Array(SQLI_PAYLOADS.length - 1).fill({ status: 200, body: BASELINE_BODY }),
          { status: 200, body: MARIADB_ERROR_BODY },          // confirmation
        ];
        setupFetchSequence(fetchResponses);

        const result = await checkSqli(makePrisma([makeTarget()]), verifiedDomain);

        expect(result.results[0].suspected).toBe(true);
        expect(result.results[0].signals).toContain('SQL_ERROR_PATTERN');
        expect(result.results[0].signals).toContain('BODY_LENGTH_DELTA');
        expect(result.results[0].confirmed).toBe(true);
        expect(result.results[0].risk).toBe('CRITICAL');
        expect(result.results[0].aiScore).toBe(95);
      });
    });
  });
});
