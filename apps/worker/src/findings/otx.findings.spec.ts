import { processOtxFindings } from './otx.findings';
import type { OtxCheckResult } from '../checks/otx.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function makeOtx(overrides: Partial<OtxCheckResult> = {}): OtxCheckResult {
  return {
    assetValue: 'example.com',
    assetType: 'DOMAIN',
    provider: 'alienvault-otx',
    enabled: true,
    skipped: false,
    pulseCount: 0,
    pulses: [],
    tags: [],
    malwareCount: 0,
    urlListCount: 0,
    passiveDnsCount: 0,
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('processOtxFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── skip/error guard ─────────────────────────────────────────────────────────

  it('current.skipped true ise hiçbir DB çağrısı yapılmaz', async () => {
    await processOtxFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeOtx({ skipped: true, skipReason: 'DISABLED' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it('current.error varsa hiçbir DB çağrısı yapılmaz', async () => {
    await processOtxFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeOtx({ error: 'OTX_TIMEOUT' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── clean ────────────────────────────────────────────────────────────────────

  it('pulseCount===0 ve malwareCount===0 ise eski OTX finding\'leri resolve edilir', async () => {
    await processOtxFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeOtx({ pulseCount: 0, malwareCount: 0 }),
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();

    const keys = mockPrisma.finding.updateMany.mock.calls.map(
      (call: any[]) => call[0].where.key
    );
    expect(keys).toContain('OTX_MALWARE_ACTIVITY_DETECTED:example.com');
    expect(keys).toContain('OTX_PULSE_DETECTED:example.com');
  });

  // ─── malware — yeni eşikler ───────────────────────────────────────────────────

  it('malwareCount >= 50 → OTX_MALWARE_ACTIVITY_DETECTED HIGH upsert edilir', async () => {
    await processOtxFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeOtx({ malwareCount: 50 }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'OTX_MALWARE_ACTIVITY_DETECTED',
          severity: 'HIGH',
          aiScore: 80,
        }),
      }),
    );
  });

  it('malwareCount 3 (< 50) → OTX_MALWARE_ACTIVITY_DETECTED MEDIUM upsert edilir', async () => {
    await processOtxFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeOtx({ malwareCount: 3 }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'OTX_MALWARE_ACTIVITY_DETECTED',
          severity: 'MEDIUM',
          aiScore: 65,
        }),
      }),
    );
  });

  it('malwareCount 1 → OTX_MALWARE_ACTIVITY_DETECTED MEDIUM upsert edilir', async () => {
    await processOtxFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeOtx({ malwareCount: 1 }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'OTX_MALWARE_ACTIVITY_DETECTED',
          severity: 'MEDIUM',
          aiScore: 65,
        }),
      }),
    );
  });

  // ─── pulse — yeni eşikler ─────────────────────────────────────────────────────

  it('pulseCount >= 10 → OTX_PULSE_DETECTED MEDIUM upsert edilir', async () => {
    await processOtxFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeOtx({
        pulseCount: 10,
        pulses: Array.from({ length: 10 }, (_, i) => ({
          name: `Pulse ${i + 1}`,
          created: new Date().toISOString(),
          tags: ['phishing'],
        })),
      }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'OTX_PULSE_DETECTED',
          severity: 'MEDIUM',
          aiScore: 60,
        }),
      }),
    );
  });

  it('pulseCount 5 (< 10) → OTX_PULSE_DETECTED LOW upsert edilir', async () => {
    await processOtxFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeOtx({
        pulseCount: 5,
        pulses: Array.from({ length: 5 }, (_, i) => ({
          name: `Pulse ${i + 1}`,
          created: new Date().toISOString(),
          tags: ['phishing'],
        })),
      }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'OTX_PULSE_DETECTED',
          severity: 'LOW',
          aiScore: 45,
        }),
      }),
    );
  });

  it('pulseCount 1 → OTX_PULSE_DETECTED LOW upsert edilir', async () => {
    await processOtxFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeOtx({
        pulseCount: 1,
        pulses: [
          { name: 'Some campaign', created: new Date().toISOString(), tags: ['c2'] },
        ],
      }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'OTX_PULSE_DETECTED',
          severity: 'LOW',
          aiScore: 45,
        }),
      }),
    );
  });

  // ─── combined malware+pulse ───────────────────────────────────────────────────

  it('malwareCount > 0 ve pulseCount > 0 ise her iki finding upsert edilir', async () => {
    await processOtxFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeOtx({
        malwareCount: 1,
        pulseCount: 3,
        pulses: Array.from({ length: 3 }, (_, i) => ({
          name: `Pulse ${i + 1}`,
          created: new Date().toISOString(),
          tags: [],
        })),
      }),
    });

    const types = mockPrisma.finding.upsert.mock.calls.map(
      (call: any[]) => call[0].create.type
    );
    expect(types).toContain('OTX_MALWARE_ACTIVITY_DETECTED');
    expect(types).toContain('OTX_PULSE_DETECTED');
  });
});
