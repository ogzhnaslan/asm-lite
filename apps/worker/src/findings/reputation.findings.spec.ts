import { processReputationFindings } from './reputation.findings';
import type { ReputationCheckResult, ProviderResult } from '../checks/reputation.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function makeProvider(overrides: Partial<ProviderResult> = {}): ProviderResult {
  return {
    name: 'urlhaus',
    status: 'ok',
    isMalicious: false,
    score: null,
    categories: [],
    reportCount: null,
    lastReportedAt: null,
    matchedIndicators: [],
    ...overrides,
  };
}

function makeReputation(overrides: Partial<ReputationCheckResult> = {}): ReputationCheckResult {
  return {
    assetValue: 'example.com',
    assetType: 'DOMAIN',
    enabled: true,
    skipped: false,
    providers: [],
    isMalicious: false,
    maxScore: null,
    categories: [],
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('processReputationFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── skip guard ───────────────────────────────────────────────────────────────

  it('current.skipped true ise hiçbir DB çağrısı yapılmaz', async () => {
    await processReputationFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeReputation({ skipped: true, skipReason: 'DISABLED' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── error guard ──────────────────────────────────────────────────────────────

  it('current.error varsa hiçbir DB çağrısı yapılmaz', async () => {
    await processReputationFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeReputation({ error: 'ALL_PROVIDERS_FAILED' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── resolve (temiz) ──────────────────────────────────────────────────────────

  it('isMalicious false ise MALICIOUS_REPUTATION_DETECTED resolve edilir', async () => {
    await processReputationFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeReputation({ isMalicious: false }),
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'MALICIOUS_REPUTATION_DETECTED:example.com' }),
      }),
    );
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
  });

  // ─── MALICIOUS_REPUTATION_DETECTED severity ───────────────────────────────────

  it('maxScore >= 90 ise MALICIOUS_REPUTATION_DETECTED CRITICAL upsert edilir', async () => {
    await processReputationFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeReputation({ isMalicious: true, maxScore: 95 }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'MALICIOUS_REPUTATION_DETECTED', severity: 'CRITICAL' }),
      }),
    );
  });

  it('maxScore >= 70 ve < 90 ise MALICIOUS_REPUTATION_DETECTED HIGH upsert edilir', async () => {
    await processReputationFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeReputation({ isMalicious: true, maxScore: 75 }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'MALICIOUS_REPUTATION_DETECTED', severity: 'HIGH' }),
      }),
    );
  });

  it('maxScore >= 40 ve < 70 ise MALICIOUS_REPUTATION_DETECTED MEDIUM upsert edilir', async () => {
    await processReputationFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeReputation({ isMalicious: true, maxScore: 55 }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'MALICIOUS_REPUTATION_DETECTED', severity: 'MEDIUM' }),
      }),
    );
  });

  it('maxScore > 0 ve < 40 ise MALICIOUS_REPUTATION_DETECTED LOW upsert edilir', async () => {
    await processReputationFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeReputation({ isMalicious: true, maxScore: 20 }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'MALICIOUS_REPUTATION_DETECTED', severity: 'LOW' }),
      }),
    );
  });

  it('isMalicious true ama maxScore null ise MALICIOUS_REPUTATION_DETECTED HIGH upsert edilir', async () => {
    await processReputationFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeReputation({ isMalicious: true, maxScore: null }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'MALICIOUS_REPUTATION_DETECTED', severity: 'HIGH' }),
      }),
    );
  });

  // ─── dataJson içerik kontrolü ─────────────────────────────────────────────────

  it('dataJson içinde categories ve providers alanları doğru yansır', async () => {
    const providers = [
      makeProvider({ name: 'urlhaus', isMalicious: true, score: 85, categories: ['malware'] }),
    ];

    await processReputationFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeReputation({
        isMalicious: true,
        maxScore: 85,
        categories: ['malware'],
        providers,
      }),
    });

    const callArg = mockPrisma.finding.upsert.mock.calls[0][0];
    const dataJson = callArg.create.dataJson as Record<string, unknown>;

    expect(dataJson).toHaveProperty('categories');
    expect(dataJson).toHaveProperty('providers');
    expect(dataJson).toHaveProperty('maxScore', 85);
    expect(dataJson).toHaveProperty('isMalicious', true);
    expect((dataJson.categories as string[])).toContain('malware');
  });
});
