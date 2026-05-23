import { processHttpFindings } from './http.findings';
import type { HttpCheckResult } from '../checks/http.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function makeHealth(overrides: Partial<HttpCheckResult>): HttpCheckResult {
  return { url: 'https://example.com', statusCode: 200, latencyMs: 100, ...overrides };
}

describe('processHttpFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── CHECK_CRASHED guard (P0 bug fix) ────────────────────────────────────────

  it('CHECK_CRASHED → hiçbir DB çağrısı yapılmaz', async () => {
    await processHttpFindings(mockPrisma as any, {
      asset, scanRunId,
      health: makeHealth({ statusCode: null, latencyMs: null, error: 'CHECK_CRASHED' }),
      prevHttpSnap: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── HTTP_HEALTH ─────────────────────────────────────────────────────────────

  it('gerçek HTTP down (statusCode:null, ECONNREFUSED) → HTTP_HEALTH CRITICAL', async () => {
    await processHttpFindings(mockPrisma as any, {
      asset, scanRunId,
      health: makeHealth({ statusCode: null, latencyMs: null, error: 'ECONNREFUSED' }),
      prevHttpSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'HTTP_HEALTH', severity: 'CRITICAL' }),
      }),
    );
  });

  it('statusCode 500 → HTTP_HEALTH HIGH', async () => {
    await processHttpFindings(mockPrisma as any, {
      asset, scanRunId,
      health: makeHealth({ statusCode: 500 }),
      prevHttpSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'HTTP_HEALTH', severity: 'HIGH' }),
      }),
    );
  });

  it('statusCode 200 → HTTP_HEALTH resolve edilir', async () => {
    await processHttpFindings(mockPrisma as any, {
      asset, scanRunId,
      health: makeHealth({ statusCode: 200 }),
      prevHttpSnap: null,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'HTTP_HEALTH:example.com' }),
      }),
    );
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
  });

  // ─── HTTP_CHANGE ─────────────────────────────────────────────────────────────

  it('önceki snapshot yoksa HTTP_CHANGE üretilmez', async () => {
    await processHttpFindings(mockPrisma as any, {
      asset, scanRunId,
      health: makeHealth({ statusCode: 200 }),
      prevHttpSnap: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'HTTP_CHANGE' }),
      }),
    );
  });

  it('statusCode 200→500 değiştiyse HTTP_CHANGE upsert edilir', async () => {
    await processHttpFindings(mockPrisma as any, {
      asset, scanRunId,
      health: makeHealth({ statusCode: 500 }),
      prevHttpSnap: { dataJson: { statusCode: 200, latencyMs: 100 } },
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'HTTP_CHANGE' }),
      }),
    );
  });

  it('latency +350ms → HTTP_CHANGE MEDIUM üretilir', async () => {
    await processHttpFindings(mockPrisma as any, {
      asset, scanRunId,
      health: makeHealth({ statusCode: 200, latencyMs: 450 }),
      prevHttpSnap: { dataJson: { statusCode: 200, latencyMs: 100 } },
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'HTTP_CHANGE', severity: 'MEDIUM' }),
      }),
    );
  });

  it('status ve latency anlamlı değişmediyse HTTP_CHANGE üretilmez', async () => {
    await processHttpFindings(mockPrisma as any, {
      asset, scanRunId,
      health: makeHealth({ statusCode: 200, latencyMs: 105 }),
      prevHttpSnap: { dataJson: { statusCode: 200, latencyMs: 100 } },
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
  });
});
