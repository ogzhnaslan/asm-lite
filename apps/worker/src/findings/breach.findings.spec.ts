import { processBreachFindings } from './breach.findings';
import type { BreachExposureCheckResult } from '../checks/breach.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function makeBreach(overrides: Partial<BreachExposureCheckResult> = {}): BreachExposureCheckResult {
  return {
    domain: 'example.com',
    enabled: true,
    skipped: false,
    provider: 'mock',
    status: 'ok',
    breachCount: 0,
    exposedEmailsCount: 0,
    latestBreachDate: null,
    sources: [],
    sensitiveDataTypes: [],
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('processBreachFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── skip guard ───────────────────────────────────────────────────────────────

  it('current.skipped true ise hiçbir DB çağrısı yapılmaz', async () => {
    await processBreachFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeBreach({ skipped: true, status: 'skipped', skipReason: 'FEATURE_DISABLED' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── error guard ──────────────────────────────────────────────────────────────

  it('status error ise hiçbir DB çağrısı yapılmaz', async () => {
    await processBreachFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeBreach({ status: 'error', error: 'HIBP_API_ERROR' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── resolve (temiz) ──────────────────────────────────────────────────────────

  it('breachCount === 0 ve status ok ise BREACH_EXPOSURE_DETECTED resolve edilir', async () => {
    await processBreachFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeBreach({ breachCount: 0 }),
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'BREACH_EXPOSURE_DETECTED:example.com' }),
      }),
    );
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
  });

  // ─── BREACH_EXPOSURE_DETECTED severity ────────────────────────────────────────

  it("sensitiveDataTypes içinde 'password' varsa BREACH_EXPOSURE_DETECTED CRITICAL upsert edilir", async () => {
    await processBreachFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeBreach({ breachCount: 1, sensitiveDataTypes: ['email', 'password'] }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'BREACH_EXPOSURE_DETECTED', severity: 'CRITICAL' }),
      }),
    );
  });

  it("sensitiveDataTypes içinde 'plaintext_password' varsa BREACH_EXPOSURE_DETECTED CRITICAL upsert edilir", async () => {
    await processBreachFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeBreach({ breachCount: 1, sensitiveDataTypes: ['plaintext_password'] }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'BREACH_EXPOSURE_DETECTED', severity: 'CRITICAL' }),
      }),
    );
  });

  it("sensitiveDataTypes içinde 'password_hash' varsa BREACH_EXPOSURE_DETECTED HIGH upsert edilir", async () => {
    await processBreachFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeBreach({ breachCount: 1, sensitiveDataTypes: ['password_hash'] }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'BREACH_EXPOSURE_DETECTED', severity: 'HIGH' }),
      }),
    );
  });

  it('breachCount >= 5 ise BREACH_EXPOSURE_DETECTED HIGH upsert edilir', async () => {
    await processBreachFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeBreach({ breachCount: 5, sensitiveDataTypes: ['email'] }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'BREACH_EXPOSURE_DETECTED', severity: 'HIGH' }),
      }),
    );
  });

  it('breachCount > 0 ama hassas parola tipi yoksa BREACH_EXPOSURE_DETECTED MEDIUM upsert edilir', async () => {
    await processBreachFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeBreach({ breachCount: 2, sensitiveDataTypes: ['email', 'username'] }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'BREACH_EXPOSURE_DETECTED', severity: 'MEDIUM' }),
      }),
    );
  });

  // ─── dataJson credential içeriği kontrolü ─────────────────────────────────────

  it('dataJson credential içeriği saklamaz; sadece özet alanlar yazılır', async () => {
    await processBreachFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeBreach({
        breachCount: 1,
        exposedEmailsCount: 500,
        latestBreachDate: '2024-01-01',
        sources: ['ExampleBreach'],
        sensitiveDataTypes: ['email'],
      }),
    });

    const callArg = mockPrisma.finding.upsert.mock.calls[0][0];
    const dataJson = callArg.create.dataJson as Record<string, unknown>;

    expect(dataJson).toHaveProperty('breachCount', 1);
    expect(dataJson).toHaveProperty('sensitiveDataTypes');
    expect(dataJson).toHaveProperty('sources');
    expect(dataJson).toHaveProperty('exposedEmailsCount');

    expect(dataJson).not.toHaveProperty('passwords');
    expect(dataJson).not.toHaveProperty('credentials');
    expect(dataJson).not.toHaveProperty('rawData');
    expect(dataJson).not.toHaveProperty('plaintext');
  });
});
