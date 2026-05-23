import { processWhoisFindings } from './whois.findings';
import type { RdapCheckResult } from '../checks/rdap.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function makeRdap(overrides: Partial<RdapCheckResult> = {}): RdapCheckResult {
  return {
    domain: 'example.com',
    registrar: 'Example Registrar',
    createdDate: '2020-01-01T00:00:00.000Z',
    updatedDate: '2025-01-01T00:00:00.000Z',
    expiresDate: null,
    nameServers: ['ns1.example.com'],
    status: ['active'],
    rawSource: 'RDAP',
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('processWhoisFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── error guard ──────────────────────────────────────────────────────────────

  it('current.error varsa hiçbir DB çağrısı yapılmaz', async () => {
    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap({ error: 'RDAP_REQUEST_FAILED' }),
      previous: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── WHOIS_EXPIRING ───────────────────────────────────────────────────────────

  it('expiresDate yoksa WHOIS_EXPIRING üretilmez ve resolve yapılmaz', async () => {
    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap({ expiresDate: null }),
      previous: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'WHOIS_EXPIRING' }) }),
    );
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'WHOIS_EXPIRING:example.com' }) }),
    );
  });

  it('domain 5 gün içinde bitiyorsa WHOIS_EXPIRING CRITICAL upsert edilir', async () => {
    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap({ expiresDate: daysFromNow(5) }),
      previous: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'WHOIS_EXPIRING', severity: 'CRITICAL' }),
      }),
    );
  });

  it('domain 10 gün içinde bitiyorsa WHOIS_EXPIRING HIGH upsert edilir', async () => {
    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap({ expiresDate: daysFromNow(10) }),
      previous: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'WHOIS_EXPIRING', severity: 'HIGH' }),
      }),
    );
  });

  it('domain 20 gün içinde bitiyorsa WHOIS_EXPIRING MEDIUM upsert edilir', async () => {
    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap({ expiresDate: daysFromNow(20) }),
      previous: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'WHOIS_EXPIRING', severity: 'MEDIUM' }),
      }),
    );
  });

  it('domain 60 gün sonra bitiyorsa WHOIS_EXPIRING resolve edilir', async () => {
    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap({ expiresDate: daysFromNow(60) }),
      previous: null,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'WHOIS_EXPIRING:example.com' }),
      }),
    );
  });

  // ─── WHOIS_CHANGE ─────────────────────────────────────────────────────────────

  it('önceki snapshot yoksa WHOIS_CHANGE üretilmez', async () => {
    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap(),
      previous: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'WHOIS_CHANGE' }) }),
    );
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'WHOIS_CHANGE:example.com' }) }),
    );
  });

  it('registrar değiştiyse WHOIS_CHANGE HIGH upsert edilir', async () => {
    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap({ registrar: 'New Registrar', expiresDate: null }),
      previous: { registrar: 'Old Registrar', nameServers: ['ns1.example.com'], status: ['active'], expiresDate: null },
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'WHOIS_CHANGE', severity: 'HIGH' }),
      }),
    );
  });

  it('nameserver değiştiyse WHOIS_CHANGE HIGH upsert edilir', async () => {
    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap({ nameServers: ['ns1.new.com'], expiresDate: null }),
      previous: { registrar: 'Example Registrar', nameServers: ['ns1.old.com'], status: ['active'], expiresDate: null },
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'WHOIS_CHANGE', severity: 'HIGH' }),
      }),
    );
  });

  it('status değiştiyse WHOIS_CHANGE MEDIUM upsert edilir', async () => {
    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap({ status: ['client transfer prohibited'], expiresDate: null }),
      previous: { registrar: 'Example Registrar', nameServers: ['ns1.example.com'], status: ['active'], expiresDate: null },
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'WHOIS_CHANGE', severity: 'MEDIUM' }),
      }),
    );
  });

  it('sadece expiresDate değiştiyse WHOIS_CHANGE LOW upsert edilir', async () => {
    const prevExpires = daysFromNow(90);
    const currExpires = daysFromNow(60);

    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap({ expiresDate: currExpires }),
      previous: { registrar: 'Example Registrar', nameServers: ['ns1.example.com'], status: ['active'], expiresDate: prevExpires },
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'WHOIS_CHANGE', severity: 'LOW' }),
      }),
    );
  });

  it('değişiklik yoksa WHOIS_CHANGE resolve edilir', async () => {
    const sameExpires = daysFromNow(60);
    const sameNs = ['ns1.example.com'];
    const sameStatus = ['active'];

    await processWhoisFindings(mockPrisma as any, {
      asset, scanRunId,
      current: makeRdap({ expiresDate: sameExpires, nameServers: sameNs, status: sameStatus }),
      previous: { registrar: 'Example Registrar', nameServers: sameNs, status: sameStatus, expiresDate: sameExpires },
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'WHOIS_CHANGE:example.com' }),
      }),
    );
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'WHOIS_CHANGE' }) }),
    );
  });
});
