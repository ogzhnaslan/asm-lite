import { processRobotsFindings } from './robots.findings';
import type { RobotsCheckResult } from '../checks/robots.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function makeRobots(overrides: Partial<RobotsCheckResult>): RobotsCheckResult {
  return {
    domain: 'example.com',
    url: null,
    exists: false,
    statusCode: null,
    contentLength: 0,
    contentHash: null,
    disallowRules: [],
    allowRules: [],
    sitemapUrls: [],
    sensitivePaths: [],
    highSeverityPaths: [],
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('processRobotsFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── error guard ─────────────────────────────────────────────────────────────

  it('current.error varsa hiçbir DB çağrısı yapılmaz (prev null)', async () => {
    await processRobotsFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRobots({ error: 'CHECK_CRASHED' }),
      previous: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it('current.error varsa hiçbir DB çağrısı yapılmaz (prev mevcut)', async () => {
    await processRobotsFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRobots({ error: 'CHECK_CRASHED' }),
      previous: { contentHash: 'abc', exists: true },
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── ROBOTS_SENSITIVE_PATH_EXPOSED ───────────────────────────────────────────

  it('exists:false → ROBOTS_SENSITIVE_PATH_EXPOSED resolve edilir', async () => {
    await processRobotsFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRobots({ exists: false }),
      previous: null,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'ROBOTS_SENSITIVE_PATH_EXPOSED:example.com' }),
      }),
    );
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'ROBOTS_SENSITIVE_PATH_EXPOSED' }) }),
    );
  });

  it('sensitivePaths var, highSeverityPaths yok → ROBOTS_SENSITIVE_PATH_EXPOSED MEDIUM', async () => {
    await processRobotsFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRobots({
        exists: true,
        contentHash: 'abc',
        sensitivePaths: ['/admin'],
        highSeverityPaths: [],
      }),
      previous: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'ROBOTS_SENSITIVE_PATH_EXPOSED', severity: 'MEDIUM' }),
      }),
    );
  });

  it('highSeverityPaths varsa ROBOTS_SENSITIVE_PATH_EXPOSED HIGH upsert edilir', async () => {
    await processRobotsFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRobots({
        exists: true,
        contentHash: 'abc',
        sensitivePaths: ['/backup', '/config', '/.env'],
        highSeverityPaths: ['/backup', '/config', '/.env'],
      }),
      previous: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'ROBOTS_SENSITIVE_PATH_EXPOSED', severity: 'HIGH' }),
      }),
    );
  });

  // ─── ROBOTS_CHANGE ────────────────────────────────────────────────────────────

  it('önceki snapshot yoksa ROBOTS_CHANGE üretilmez', async () => {
    await processRobotsFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRobots({ exists: true, contentHash: 'abc' }),
      previous: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'ROBOTS_CHANGE' }) }),
    );
  });

  it('contentHash değiştiyse ROBOTS_CHANGE LOW upsert edilir', async () => {
    await processRobotsFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRobots({ exists: true, contentHash: 'def', disallowRules: ['/new'] }),
      previous: { contentHash: 'abc', disallowRules: [] },
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'ROBOTS_CHANGE', severity: 'LOW' }),
      }),
    );
  });

  it('contentHash aynıysa ROBOTS_CHANGE resolve edilir', async () => {
    await processRobotsFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRobots({ exists: true, contentHash: 'abc', disallowRules: ['/admin'] }),
      previous: { contentHash: 'abc', disallowRules: ['/admin'] },
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'ROBOTS_CHANGE:example.com' }),
      }),
    );
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'ROBOTS_CHANGE' }) }),
    );
  });

  it('exists:false olduğunda ROBOTS_CHANGE resolve edilir', async () => {
    await processRobotsFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRobots({ exists: false, contentHash: null }),
      previous: { contentHash: 'abc', exists: true },
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'ROBOTS_CHANGE:example.com' }),
      }),
    );
  });
});
