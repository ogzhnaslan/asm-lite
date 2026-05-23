import { processPhishTankFindings } from './phishtank.findings';
import type { PhishTankCheckResult } from '../checks/phishtank.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function makePhishTank(overrides: Partial<PhishTankCheckResult> = {}): PhishTankCheckResult {
  return {
    domain: 'example.com',
    provider: 'phishtank',
    enabled: true,
    skipped: false,
    isListed: false,
    verifiedMatches: 0,
    onlineMatches: 0,
    matchedUrls: [],
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('processPhishTankFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── skip guard ───────────────────────────────────────────────────────────────

  it('current.skipped true ise hiçbir DB çağrısı yapılmaz', async () => {
    await processPhishTankFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makePhishTank({ skipped: true, skipReason: 'DISABLED' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── error guard ──────────────────────────────────────────────────────────────

  it('current.error varsa hiçbir DB çağrısı yapılmaz', async () => {
    await processPhishTankFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makePhishTank({ error: 'FETCH_FAILED' }),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── resolve (temiz) ──────────────────────────────────────────────────────────

  it('isListed false ise PHISHING_DETECTED resolve edilir', async () => {
    await processPhishTankFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makePhishTank({ isListed: false }),
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'PHISHING_DETECTED:example.com' }),
      }),
    );
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
  });

  // ─── PHISHING_DETECTED severity ───────────────────────────────────────────────

  it('verifiedMatches > 0 ve onlineMatches > 0 ise PHISHING_DETECTED CRITICAL upsert edilir', async () => {
    await processPhishTankFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makePhishTank({
        isListed: true,
        verifiedMatches: 2,
        onlineMatches: 1,
        matchedUrls: [{ url: 'http://example.com/phish' }],
      }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'PHISHING_DETECTED', severity: 'CRITICAL' }),
      }),
    );
  });

  it('verifiedMatches > 0 ama onlineMatches === 0 ise PHISHING_DETECTED HIGH upsert edilir', async () => {
    await processPhishTankFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makePhishTank({
        isListed: true,
        verifiedMatches: 1,
        onlineMatches: 0,
        matchedUrls: [{ url: 'http://example.com/phish' }],
      }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'PHISHING_DETECTED', severity: 'HIGH' }),
      }),
    );
  });

  it('isListed true ama verifiedMatches ve onlineMatches === 0 ise PHISHING_DETECTED MEDIUM upsert edilir', async () => {
    await processPhishTankFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makePhishTank({
        isListed: true,
        verifiedMatches: 0,
        onlineMatches: 0,
        matchedUrls: [{ url: 'http://example.com/phish' }],
      }),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'PHISHING_DETECTED', severity: 'MEDIUM' }),
      }),
    );
  });
});
