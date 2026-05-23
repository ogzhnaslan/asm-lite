import { processGeoIpFindings } from './geoip.findings';
import type { GeoIpCheckResult } from '../checks/geoip.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function makeGeoIp(overrides: Partial<GeoIpCheckResult> = {}): GeoIpCheckResult {
  return {
    assetValue: 'example.com',
    assetType: 'DOMAIN',
    resolvedIp: '1.2.3.4',
    country: 'United States',
    countryCode: 'US',
    region: 'California',
    city: 'San Francisco',
    latitude: 37.7749,
    longitude: -122.4194,
    asn: 'AS111',
    isp: 'Example ISP',
    organization: 'Example Org',
    provider: 'ip-api',
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('processGeoIpFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── error guard ──────────────────────────────────────────────────────────────

  it('current.error varsa hiçbir DB çağrısı yapılmaz', async () => {
    await processGeoIpFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeGeoIp({ error: 'GEOIP_LOOKUP_FAILED' }),
      previous: { asn: 'AS111' },
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── previous snapshot yok ────────────────────────────────────────────────────

  it('önceki snapshot yoksa ASN_CHANGE ve GEOIP_CHANGE üretilmez', async () => {
    await processGeoIpFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeGeoIp(),
      previous: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── ASN_CHANGE ───────────────────────────────────────────────────────────────

  it('ASN değiştiyse ASN_CHANGE HIGH upsert edilir', async () => {
    const current = makeGeoIp({ asn: 'AS222' });
    const previous = { ...current, asn: 'AS111' };

    await processGeoIpFindings(mockPrisma as any, {
      asset, scanRunId, current, previous,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'ASN_CHANGE', severity: 'HIGH' }),
      }),
    );
  });

  it('ASN aynıysa ASN_CHANGE resolve edilir', async () => {
    const current = makeGeoIp();
    const previous = { ...current };

    await processGeoIpFindings(mockPrisma as any, {
      asset, scanRunId, current, previous,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'ASN_CHANGE:example.com' }),
      }),
    );
  });

  // ─── GEOIP_CHANGE ─────────────────────────────────────────────────────────────

  it('countryCode ve organization birlikte değiştiyse GEOIP_CHANGE HIGH upsert edilir', async () => {
    const current = makeGeoIp({ countryCode: 'TR', organization: 'NewOrg' });
    const previous = { ...current, countryCode: 'US', organization: 'OldOrg' };

    await processGeoIpFindings(mockPrisma as any, {
      asset, scanRunId, current, previous,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'GEOIP_CHANGE', severity: 'HIGH' }),
      }),
    );
  });

  it('sadece city değiştiyse GEOIP_CHANGE LOW upsert edilir', async () => {
    const current = makeGeoIp({ city: 'New York' });
    const previous = { ...current, city: 'San Francisco' };

    await processGeoIpFindings(mockPrisma as any, {
      asset, scanRunId, current, previous,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'GEOIP_CHANGE', severity: 'LOW' }),
      }),
    );
  });

  it('sadece ISP değiştiyse GEOIP_CHANGE MEDIUM upsert edilir', async () => {
    const current = makeGeoIp({ isp: 'New ISP' });
    const previous = { ...current, isp: 'Old ISP' };

    await processGeoIpFindings(mockPrisma as any, {
      asset, scanRunId, current, previous,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'GEOIP_CHANGE', severity: 'MEDIUM' }),
      }),
    );
  });

  it('değişiklik yoksa GEOIP_CHANGE resolve edilir', async () => {
    const current = makeGeoIp();
    const previous = { ...current };

    await processGeoIpFindings(mockPrisma as any, {
      asset, scanRunId, current, previous,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'GEOIP_CHANGE:example.com' }),
      }),
    );
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'GEOIP_CHANGE' }) }),
    );
  });
});
