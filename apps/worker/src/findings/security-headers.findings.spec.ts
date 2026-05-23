import { processSecurityHeaderFindings } from './security-headers.findings';
import { REQUIRED_HEADERS } from '../checks/security-headers.check';
import type { SecurityHeadersCheckResult } from '../checks/security-headers.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function makeHeaders(missing: string[]): SecurityHeadersCheckResult {
  return {
    ok: true,
    checkedUrl: 'https://example.com',
    headers: {},
    missing,
    missingDetails: REQUIRED_HEADERS.filter((h) => missing.includes(h.short)),
    present: REQUIRED_HEADERS
      .filter((h) => !missing.includes(h.short))
      .map((h) => ({ name: h.name, short: h.short, value: 'present' })),
  };
}

describe('processSecurityHeaderFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── ok:false early return ────────────────────────────────────────────────────

  it('ok:false (IP_ASSET) → hiçbir DB çağrısı yapılmaz', async () => {
    const headersResult: SecurityHeadersCheckResult = {
      ok: false, checkedUrl: null, headers: {}, missing: [], missingDetails: [], present: [],
    };

    await processSecurityHeaderFindings(mockPrisma as any, { asset, scanRunId, headersResult });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it('ok:false (CHECK_CRASHED) → hiçbir DB çağrısı yapılmaz', async () => {
    const headersResult: SecurityHeadersCheckResult = {
      ok: false, checkedUrl: null, error: 'CHECK_CRASHED', headers: {}, missing: [], missingDetails: [], present: [],
    };

    await processSecurityHeaderFindings(mockPrisma as any, { asset, scanRunId, headersResult });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── eksik header upsert ─────────────────────────────────────────────────────

  it('Content-Security-Policy eksik → SECURITY_HEADER_MISSING HIGH', async () => {
    await processSecurityHeaderFindings(mockPrisma as any, {
      asset, scanRunId,
      headersResult: makeHeaders(['CSP']),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assetId_key: { assetId: 'asset-1', key: 'SECURITY_HEADER_MISSING:example.com:CSP' } }),
        create: expect.objectContaining({ type: 'SECURITY_HEADER_MISSING', severity: 'HIGH' }),
      }),
    );
  });

  it('Strict-Transport-Security eksik → SECURITY_HEADER_MISSING HIGH', async () => {
    await processSecurityHeaderFindings(mockPrisma as any, {
      asset, scanRunId,
      headersResult: makeHeaders(['HSTS']),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'SECURITY_HEADER_MISSING', severity: 'HIGH' }),
        where: expect.objectContaining({ assetId_key: expect.objectContaining({ key: 'SECURITY_HEADER_MISSING:example.com:HSTS' }) }),
      }),
    );
  });

  it('X-Frame-Options eksik → SECURITY_HEADER_MISSING MEDIUM', async () => {
    await processSecurityHeaderFindings(mockPrisma as any, {
      asset, scanRunId,
      headersResult: makeHeaders(['XFO']),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'SECURITY_HEADER_MISSING', severity: 'MEDIUM' }),
      }),
    );
  });

  it('Referrer-Policy eksik → SECURITY_HEADER_MISSING LOW', async () => {
    await processSecurityHeaderFindings(mockPrisma as any, {
      asset, scanRunId,
      headersResult: makeHeaders(['RP']),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'SECURITY_HEADER_MISSING', severity: 'LOW' }),
      }),
    );
  });

  // ─── tüm header'lar mevcut → hepsi resolve ───────────────────────────────────

  it('tüm header\'lar mevcut → upsert yapılmaz, 6 resolve çağrılır', async () => {
    await processSecurityHeaderFindings(mockPrisma as any, {
      asset, scanRunId,
      headersResult: makeHeaders([]),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).toHaveBeenCalledTimes(REQUIRED_HEADERS.length);
  });

  // ─── karışık durum ────────────────────────────────────────────────────────────

  it('CSP ve XFO eksik → ikisi upsert, diğerleri resolve', async () => {
    await processSecurityHeaderFindings(mockPrisma as any, {
      asset, scanRunId,
      headersResult: makeHeaders(['CSP', 'XFO']),
    });

    // 2 eksik header upsert edilmeli
    expect(mockPrisma.finding.upsert).toHaveBeenCalledTimes(2);
    // 4 mevcut header resolve edilmeli
    expect(mockPrisma.finding.updateMany).toHaveBeenCalledTimes(REQUIRED_HEADERS.length - 2);

    // CSP → HIGH
    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ severity: 'HIGH' }),
        where: expect.objectContaining({ assetId_key: expect.objectContaining({ key: 'SECURITY_HEADER_MISSING:example.com:CSP' }) }),
      }),
    );
    // XFO → MEDIUM
    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ severity: 'MEDIUM' }),
        where: expect.objectContaining({ assetId_key: expect.objectContaining({ key: 'SECURITY_HEADER_MISSING:example.com:XFO' }) }),
      }),
    );
  });
});
