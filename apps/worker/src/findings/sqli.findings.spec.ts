import { processSqliFindings, buildSqliFindingKey } from './sqli.findings';
import type { SqliCheckResult, SqliTargetResult } from '../checks/sqli.check';
import type { SqliSignal } from '../checks/sqli/detectors';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

// ─── Fixture builders ────────────────────────────────────────────────────────

function makeResult(overrides: Partial<SqliTargetResult> = {}): SqliTargetResult {
  return {
    targetId: 't-1',
    url: 'https://example.com/product?id=1',
    method: 'GET',
    path: '/product',
    param: 'id',
    suspected: true,
    risk: 'HIGH',
    aiScore: 85,
    confirmed: false,
    payloadId: 'sql_quote',
    payloadCategory: 'syntax_error',
    signals: ['SQL_ERROR_PATTERN'] as SqliSignal[],
    evidence: {
      baselineStatus: 200,
      baselineLength: 10_000,
      payloadStatus: 200,
      payloadLength: 9_500,
      matchedErrorPattern: 'mysql',
      matchedErrorSnippet: 'SQL syntax near ...',
      networkError: null,
    },
    checkedAt: '2026-05-22T10:00:00.000Z',
    ...overrides,
  };
}

function makeCheck(overrides: Partial<SqliCheckResult> = {}): SqliCheckResult {
  return {
    enabled: true,
    skipped: false,
    targetCount: 0,
    testedParams: 0,
    suspectedCount: 0,
    results: [],
    checkedAt: '2026-05-22T10:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('processSqliFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── Guard: skipped / error ────────────────────────────────────────────────

  it('skipped result → hiçbir DB çağrısı yok', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({ skipped: true, skipReason: 'DISABLED' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it('NO_TARGETS skip → hiçbir DB çağrısı yok', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({ skipped: true, skipReason: 'NO_TARGETS' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it('error result (CHECK_CRASHED) → finding üretmez ve resolve etmez', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({ error: 'CHECK_CRASHED' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it('error result (DB_ERROR) → finding üretmez ve resolve etmez', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({ error: 'DB_ERROR' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── Resolve: suspected=false ──────────────────────────────────────────────

  it('suspected=false → eski finding resolved (updateMany çağrılır)', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({
        results: [makeResult({ suspected: false, risk: null, aiScore: null, signals: [] })],
      }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assetId: 'asset-1',
          key: 'SQLI:example.com:/product:id',
          resolvedAt: null,
        }),
        data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
      }),
    );
  });

  it('risk=null (suspected=true ama risk yok) → resolve', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({
        results: [makeResult({ suspected: true, risk: null, aiScore: null, signals: [] })],
      }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).toHaveBeenCalled();
  });

  // ─── Upsert: severity mapping ──────────────────────────────────────────────

  it('suspected=true risk=LOW → LOW severity finding upsert (aiScore=result.aiScore)', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({
        results: [makeResult({ risk: 'LOW', aiScore: 35, signals: ['STATUS_CODE_CHANGED'] })],
      }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'SQL_INJECTION_SUSPECTED',
          severity: 'LOW',
          aiScore: 35,
        }),
      }),
    );
  });

  it('suspected=true risk=HIGH → HIGH severity finding upsert', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({ results: [makeResult({ risk: 'HIGH', aiScore: 85 })] }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ severity: 'HIGH', aiScore: 85 }),
      }),
    );
  });

  it('suspected=true risk=CRITICAL → CRITICAL severity, aiScore 95', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({
        results: [makeResult({
          risk: 'CRITICAL', aiScore: 95, confirmed: true,
          signals: ['SQL_ERROR_PATTERN', 'STATUS_CODE_5XX'] as SqliSignal[],
        })],
      }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ severity: 'CRITICAL', aiScore: 95 }),
      }),
    );
  });

  it('result.aiScore null ise severity fallback aiScore kullanılır (MEDIUM→65)', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({ results: [makeResult({ risk: 'MEDIUM', aiScore: null })] }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ severity: 'MEDIUM', aiScore: 65 }),
      }),
    );
  });

  // ─── Idempotency & upsert pattern ──────────────────────────────────────────

  it('upsert "where assetId_key" ile çağrılır → aynı key ikinci kez gelirse update yapılır', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({ results: [makeResult()] }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assetId_key: { assetId: 'asset-1', key: 'SQLI:example.com:/product:id' } },
        update: expect.objectContaining({ isNew: false, lastSeenAt: expect.any(Date), resolvedAt: null }),
        create: expect.objectContaining({ isNew: true, lastSeenAt: expect.any(Date) }),
      }),
    );
  });

  it('upsert update bloğu resolvedAt=null set ediyor (resolved iken tekrar suspected olursa reopen)', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({ results: [makeResult()] }),
    });

    const call = mockPrisma.finding.upsert.mock.calls[0]![0] as { update: { resolvedAt: null } };
    expect(call.update.resolvedAt).toBeNull();
  });

  // ─── dataJson içerik kontrolü ──────────────────────────────────────────────

  it('dataJson içinde URL/path/param/signals/evidence saklanır', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({ results: [makeResult()] }),
    });

    const call = mockPrisma.finding.upsert.mock.calls[0]![0] as {
      create: { dataJson: Record<string, unknown> };
    };
    expect(call.create.dataJson).toMatchObject({
      url: 'https://example.com/product?id=1',
      method: 'GET',
      path: '/product',
      param: 'id',
      payloadId: 'sql_quote',
      payloadCategory: 'syntax_error',
      suspected: true,
      risk: 'HIGH',
      confirmed: false,
      signals: ['SQL_ERROR_PATTERN'],
    });
    expect(call.create.dataJson.evidence).toMatchObject({
      baselineStatus: 200,
      payloadStatus: 200,
      matchedErrorPattern: 'mysql',
    });
  });

  // ─── aiWhyJson içerik kontrolü ─────────────────────────────────────────────

  it('aiWhyJson Türkçe summary/impact/recommendations içerir', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({
        results: [makeResult({
          signals: ['SQL_ERROR_PATTERN', 'STATUS_CODE_5XX'] as SqliSignal[],
          confirmed: true,
        })],
      }),
    });

    const call = mockPrisma.finding.upsert.mock.calls[0]![0] as {
      create: { aiWhyJson: { summary: string; reasons: string[]; recommendations: string[]; impact: string; signals: string[] } };
    };
    const why = call.create.aiWhyJson;

    expect(why.summary).toContain('/product');
    expect(why.summary).toContain('id');
    expect(why.summary).toContain('SQL Injection şüphesi');
    expect(why.reasons).toContain('Yanıtta SQL hata paterni görüldü.');
    expect(why.reasons).toContain('Payload sonrası sunucu 5xx hata döndürdü.');
    expect(why.reasons).toContain('Aynı payload ikinci denemede de benzer sinyal üretti.');
    expect(why.impact).toContain('manuel doğrulama önerilir');
    expect(why.recommendations).toContain('Prepared statement / parameterized query kullanın.');
    expect(why.signals).toEqual(['SQL_ERROR_PATTERN', 'STATUS_CODE_5XX']);
  });

  // ─── Multiple results — mixed ──────────────────────────────────────────────

  it('multiple results: biri suspected biri clean → biri upsert, biri resolve', async () => {
    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({
        results: [
          makeResult({ targetId: 't-1', path: '/product', param: 'id', suspected: true, risk: 'HIGH' }),
          makeResult({ targetId: 't-2', path: '/search', param: 'q', suspected: false, risk: null, aiScore: null, signals: [] }),
        ],
      }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.finding.updateMany).toHaveBeenCalledTimes(1);

    // upsert key /product:id
    const upsertCall = mockPrisma.finding.upsert.mock.calls[0]![0] as { create: { key: string } };
    expect(upsertCall.create.key).toBe('SQLI:example.com:/product:id');

    // resolve key /search:q
    const resolveCall = mockPrisma.finding.updateMany.mock.calls[0]![0] as { where: { key: string } };
    expect(resolveCall.where.key).toBe('SQLI:example.com:/search:q');
  });

  // ─── Per-result error isolation ────────────────────────────────────────────

  it('processor içindeki tek result hatası tüm processor\'ı patlatmaz', async () => {
    // İlk upsert fail eder, ikincisi başarılı olur
    mockPrisma.finding.upsert
      .mockRejectedValueOnce(new Error('DB error on first target'))
      .mockResolvedValueOnce({});

    await processSqliFindings(mockPrisma as any, {
      asset, scanRunId,
      sqliResult: makeCheck({
        results: [
          makeResult({ targetId: 't-1', path: '/a', param: 'x', risk: 'HIGH' }),
          makeResult({ targetId: 't-2', path: '/b', param: 'y', risk: 'CRITICAL' }),
        ],
      }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledTimes(2);
  });

  // ─── Key format ────────────────────────────────────────────────────────────

  it('finding key formatı SQLI:<asset>:<path>:<param>', () => {
    expect(buildSqliFindingKey('example.com', '/product', 'id')).toBe('SQLI:example.com:/product:id');
    expect(buildSqliFindingKey('foo.bar', '/api/items', 'q')).toBe('SQLI:foo.bar:/api/items:q');
  });
});
