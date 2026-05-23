// ─── Module mocks ─────────────────────────────────────────────────────────────
// All checks, findings, AI and logger are mocked.
// safeCheck is NOT mocked — crash isolation is tested through it.

jest.mock('./checks/ports.check');
jest.mock('./checks/tls.check');
jest.mock('./checks/http.check');
jest.mock('./checks/security-headers.check');
jest.mock('./checks/dns-records.check');
jest.mock('./checks/rdap.check');
jest.mock('./checks/geoip.check');
jest.mock('./checks/robots.check');
jest.mock('./checks/phishtank.check');
jest.mock('./checks/reputation.check');
jest.mock('./checks/breach.check');
jest.mock('./checks/otx.check');
jest.mock('./checks/sqli.check');

jest.mock('./findings/port.findings');
jest.mock('./findings/tls.findings');
jest.mock('./findings/http.findings');
jest.mock('./findings/security-headers.findings');
jest.mock('./findings/dns.findings');
jest.mock('./findings/whois.findings');
jest.mock('./findings/geoip.findings');
jest.mock('./findings/robots.findings');
jest.mock('./findings/phishtank.findings');
jest.mock('./findings/reputation.findings');
jest.mock('./findings/breach.findings');
jest.mock('./findings/otx.findings');
jest.mock('./findings/sqli.findings');

jest.mock('./ai/analyze');
jest.mock('./utils/logger');

// ─── Imports ──────────────────────────────────────────────────────────────────

import { runScan } from './run-scan';
import { PrismaClient } from '@prisma/client';

import { checkPorts } from './checks/ports.check';
import { checkTls } from './checks/tls.check';
import { checkHttp } from './checks/http.check';
import { checkSecurityHeaders } from './checks/security-headers.check';
import { checkDnsRecords } from './checks/dns-records.check';
import { checkRdap } from './checks/rdap.check';
import { checkGeoIp } from './checks/geoip.check';
import { checkRobotsTxt } from './checks/robots.check';
import { checkPhishTank } from './checks/phishtank.check';
import { checkReputation } from './checks/reputation.check';
import { checkBreachExposure } from './checks/breach.check';
import { checkOtx } from './checks/otx.check';
import { checkSqli } from './checks/sqli.check';

import { processPortFindings } from './findings/port.findings';
import { processTlsFindings } from './findings/tls.findings';
import { processHttpFindings } from './findings/http.findings';
import { processSecurityHeaderFindings } from './findings/security-headers.findings';
import { processDnsFindings } from './findings/dns.findings';
import { processWhoisFindings } from './findings/whois.findings';
import { processGeoIpFindings } from './findings/geoip.findings';
import { processRobotsFindings } from './findings/robots.findings';
import { processPhishTankFindings } from './findings/phishtank.findings';
import { processReputationFindings } from './findings/reputation.findings';
import { processBreachFindings } from './findings/breach.findings';
import { processOtxFindings } from './findings/otx.findings';
import { processSqliFindings } from './findings/sqli.findings';

import { analyzeFindings } from './ai/analyze';
import { log } from './utils/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeJob(assetId: string, scanRunId?: string) {
  return { name: 'scan.run', data: { assetId, scanRunId } };
}

function makeAsset(type: 'DOMAIN' | 'IP' = 'DOMAIN') {
  return {
    id: 'asset-1',
    status: 'VERIFIED',
    type,
    value: type === 'DOMAIN' ? 'example.com' : '1.2.3.4',
  };
}

// Minimal valid check return values — allow the scan to reach the DONE update
const DOMAIN_CHECKS_OK = {
  ports:     { checkedPorts: [], results: [], openPorts: [] },
  tls:       { ok: true, host: 'example.com', port: 443 },
  http:      { url: 'https://example.com', statusCode: 200, latencyMs: 50 },
  headers:   { ok: true, checkedUrl: 'https://example.com', headers: {}, missing: [], missingDetails: [], present: [] },
  dns:       { domain: 'example.com', records: [], dmarcRecord: null, checkedAt: '', errors: {} },
  rdap:      { domain: 'example.com', registrar: null, createdDate: null, updatedDate: null, expiresDate: null, nameServers: [], status: [], rawSource: 'RDAP' as const, checkedAt: '' },
  geoip:     { assetValue: 'example.com', assetType: 'DOMAIN' as const, resolvedIp: null, country: null, countryCode: null, region: null, city: null, latitude: null, longitude: null, asn: null, isp: null, organization: null, provider: 'ip-api', checkedAt: '' },
  robots:    { domain: 'example.com', url: null, exists: false, statusCode: null, contentLength: 0, contentHash: null, disallowRules: [], allowRules: [], sitemapUrls: [], sensitivePaths: [], highSeverityPaths: [], checkedAt: '' },
  phishtank: { domain: 'example.com', provider: 'phishtank' as const, enabled: false, skipped: true, isListed: false, verifiedMatches: 0, onlineMatches: 0, matchedUrls: [], checkedAt: '' },
  reputation: { assetValue: 'example.com', assetType: 'DOMAIN' as const, enabled: false, skipped: true, providers: [], isMalicious: false, maxScore: null, categories: [], checkedAt: '' },
  breach:    { domain: 'example.com', enabled: false, skipped: true, provider: 'mock' as const, status: 'skipped' as const, breachCount: 0, exposedEmailsCount: null, latestBreachDate: null, sources: [], sensitiveDataTypes: [], checkedAt: '' },
  otx:       { assetValue: 'example.com', assetType: 'DOMAIN' as const, provider: 'alienvault-otx' as const, enabled: false, skipped: true, pulseCount: 0, pulses: [], tags: [], malwareCount: 0, urlListCount: 0, passiveDnsCount: 0, checkedAt: '' },
  sqli:      { enabled: true, skipped: false, targetCount: 1, testedParams: 1, suspectedCount: 0, results: [], checkedAt: '' },
};

function setupCheckMocks(overrides: Partial<Record<string, unknown>> = {}) {
  const v = { ...DOMAIN_CHECKS_OK, ...overrides };
  (checkPorts as jest.Mock).mockResolvedValue(v.ports);
  (checkTls as jest.Mock).mockResolvedValue(v.tls);
  (checkHttp as jest.Mock).mockResolvedValue(v.http);
  (checkSecurityHeaders as jest.Mock).mockResolvedValue(v.headers);
  (checkDnsRecords as jest.Mock).mockResolvedValue(v.dns);
  (checkRdap as jest.Mock).mockResolvedValue(v.rdap);
  (checkGeoIp as jest.Mock).mockResolvedValue(v.geoip);
  (checkRobotsTxt as jest.Mock).mockResolvedValue(v.robots);
  (checkPhishTank as jest.Mock).mockResolvedValue(v.phishtank);
  (checkReputation as jest.Mock).mockResolvedValue(v.reputation);
  (checkBreachExposure as jest.Mock).mockResolvedValue(v.breach);
  (checkOtx as jest.Mock).mockResolvedValue(v.otx);
  (checkSqli as jest.Mock).mockResolvedValue(v.sqli);
}

function setupFinderMocks() {
  (processPortFindings as jest.Mock).mockResolvedValue(undefined);
  (processTlsFindings as jest.Mock).mockResolvedValue(undefined);
  (processHttpFindings as jest.Mock).mockResolvedValue(undefined);
  (processSecurityHeaderFindings as jest.Mock).mockResolvedValue(undefined);
  (processDnsFindings as jest.Mock).mockResolvedValue(undefined);
  (processWhoisFindings as jest.Mock).mockResolvedValue(undefined);
  (processGeoIpFindings as jest.Mock).mockResolvedValue(undefined);
  (processRobotsFindings as jest.Mock).mockResolvedValue(undefined);
  (processPhishTankFindings as jest.Mock).mockResolvedValue(undefined);
  (processReputationFindings as jest.Mock).mockResolvedValue(undefined);
  (processBreachFindings as jest.Mock).mockResolvedValue(undefined);
  (processOtxFindings as jest.Mock).mockResolvedValue(undefined);
  (processSqliFindings as jest.Mock).mockResolvedValue(undefined);
}

// Mock Prisma — typed as any to avoid full PrismaClient type compat
function makeMockPrisma() {
  return {
    asset:           { findUnique: jest.fn() },
    scanRun:         { create: jest.fn().mockResolvedValue({ id: 'run-1' }), update: jest.fn().mockResolvedValue({}) },
    scanCheckResult: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null) },
    finding:         { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('runScan', () => {
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = makeMockPrisma();
    setupCheckMocks();
    setupFinderMocks();
    (analyzeFindings as jest.Mock).mockResolvedValue([]);
    // Env determinizm — SQLi branch'i sadece explicit set edildiğinde aktif
    delete process.env.ENABLE_SQLI_CHECK;
  });

  afterEach(() => {
    delete process.env.ENABLE_SQLI_CHECK;
  });

  // ─── 1. Asset lookup failures ─────────────────────────────────────────────

  describe('asset bulunamadı', () => {
    it('scheduled scan — ok:false, reason:ASSET_NOT_FOUND, ScanRun update yok', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null);

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('missing-asset'));

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('ASSET_NOT_FOUND');
      expect(mockPrisma.scanRun.update).not.toHaveBeenCalled();
    });

    it('manual scan — ScanRun FAILED yapılır', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null);

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('missing-asset', 'run-99'));

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('ASSET_NOT_FOUND');
      expect(mockPrisma.scanRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'run-99' }, data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('check\'ler çağrılmaz', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null);

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('missing-asset', 'run-99'));

      expect(checkPorts).not.toHaveBeenCalled();
      expect(checkTls).not.toHaveBeenCalled();
      expect(checkHttp).not.toHaveBeenCalled();
    });

    it('snapshot yazılmaz', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null);

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('missing-asset', 'run-99'));

      expect(mockPrisma.scanCheckResult.create).not.toHaveBeenCalled();
    });
  });

  // ─── 2. Asset VERIFIED değil ──────────────────────────────────────────────

  describe('asset PENDING (VERIFIED değil)', () => {
    it('ok:false, reason:ASSET_NOT_VERIFIED döner', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ ...makeAsset(), status: 'PENDING' });

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('ASSET_NOT_VERIFIED');
    });

    it('ScanRun FAILED yapılır', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ ...makeAsset(), status: 'PENDING' });

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(mockPrisma.scanRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('ağ check\'leri hiç çağrılmaz — güvenlik invariantı', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ ...makeAsset(), status: 'PENDING' });

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(checkPorts).not.toHaveBeenCalled();
      expect(checkTls).not.toHaveBeenCalled();
      expect(checkHttp).not.toHaveBeenCalled();
      expect(checkDnsRecords).not.toHaveBeenCalled();
      expect(checkReputation).not.toHaveBeenCalled();
      expect(checkOtx).not.toHaveBeenCalled();
    });
  });

  // ─── 3. Manual vs scheduled scan ─────────────────────────────────────────

  describe('manual vs scheduled', () => {
    it('manual scan — mevcut scanRunId kullanılır, create çağrılmaz', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(makeAsset());

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'existing-run-id'));

      expect(result.ok).toBe(true);
      expect(result.scanRunId).toBe('existing-run-id');
      expect(mockPrisma.scanRun.create).not.toHaveBeenCalled();
      expect(mockPrisma.scanRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'existing-run-id' }, data: expect.objectContaining({ status: 'RUNNING' }) }),
      );
    });

    it('scheduled scan — yeni ScanRun oluşturulur, dönen id kullanılır', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(makeAsset());
      mockPrisma.scanRun.create.mockResolvedValue({ id: 'new-run-id' });

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1'));

      expect(result.ok).toBe(true);
      expect(result.scanRunId).toBe('new-run-id');
      expect(mockPrisma.scanRun.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ assetId: 'asset-1', status: 'RUNNING' }) }),
      );
    });
  });

  // ─── 4. Happy path — DOMAIN ───────────────────────────────────────────────

  describe('DOMAIN asset başarılı scan', () => {
    beforeEach(() => {
      mockPrisma.asset.findUnique.mockResolvedValue(makeAsset('DOMAIN'));
    });

    it('tüm 12 check çağrılır', async () => {
      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(true);
      expect(checkPorts).toHaveBeenCalledTimes(1);
      expect(checkTls).toHaveBeenCalledTimes(1);
      expect(checkHttp).toHaveBeenCalledTimes(1);
      expect(checkSecurityHeaders).toHaveBeenCalledTimes(1);
      expect(checkDnsRecords).toHaveBeenCalledTimes(1);
      expect(checkRdap).toHaveBeenCalledTimes(1);
      expect(checkGeoIp).toHaveBeenCalledTimes(1);
      expect(checkRobotsTxt).toHaveBeenCalledTimes(1);
      expect(checkPhishTank).toHaveBeenCalledTimes(1);
      expect(checkReputation).toHaveBeenCalledTimes(1);
      expect(checkBreachExposure).toHaveBeenCalledTimes(1);
      expect(checkOtx).toHaveBeenCalledTimes(1);
    });

    it('ScanRun DONE ve finishedAt ile güncellenir', async () => {
      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(mockPrisma.scanRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1' },
          data: expect.objectContaining({ status: 'DONE', finishedAt: expect.any(Date) }),
        }),
      );
    });

    it('12 snapshot yazılır (DOMAIN için)', async () => {
      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      const types = (mockPrisma.scanCheckResult.create as jest.Mock).mock.calls.map(
        (c) => (c[0] as { data: { type: string } }).data.type,
      );
      expect(types).toContain('PORTS');
      expect(types).toContain('TLS_INFO');
      expect(types).toContain('HTTP_HEALTH');
      expect(types).toContain('SECURITY_HEADERS');
      expect(types).toContain('DNS_RECORDS');
      expect(types).toContain('RDAP_INFO');
      expect(types).toContain('ROBOTS_TXT');
      expect(types).toContain('PHISHTANK_REPUTATION');
      expect(types).toContain('BREACH_EXPOSURE');
      expect(types).toContain('GEOIP_INFO');
      expect(types).toContain('MALICIOUS_REPUTATION');
      expect(types).toContain('OTX_INTELLIGENCE');
    });

    it('tüm finding processor\'lar çağrılır', async () => {
      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(processPortFindings).toHaveBeenCalledTimes(1);
      expect(processTlsFindings).toHaveBeenCalledTimes(1);
      expect(processHttpFindings).toHaveBeenCalledTimes(1);
      expect(processSecurityHeaderFindings).toHaveBeenCalledTimes(1);
      expect(processDnsFindings).toHaveBeenCalledTimes(1);
      expect(processWhoisFindings).toHaveBeenCalledTimes(1);
      expect(processGeoIpFindings).toHaveBeenCalledTimes(1);
      expect(processRobotsFindings).toHaveBeenCalledTimes(1);
      expect(processPhishTankFindings).toHaveBeenCalledTimes(1);
      expect(processReputationFindings).toHaveBeenCalledTimes(1);
      expect(processBreachFindings).toHaveBeenCalledTimes(1);
      expect(processOtxFindings).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 5. IP asset — domain-only checks çağrılmaz ──────────────────────────

  describe('IP asset scan', () => {
    beforeEach(() => {
      mockPrisma.asset.findUnique.mockResolvedValue(makeAsset('IP'));
    });

    it('port/tls/http/geoip/reputation/otx çağrılır', async () => {
      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(true);
      expect(checkPorts).toHaveBeenCalledTimes(1);
      expect(checkTls).toHaveBeenCalledTimes(1);
      expect(checkHttp).toHaveBeenCalledTimes(1);
      expect(checkGeoIp).toHaveBeenCalledTimes(1);
      expect(checkReputation).toHaveBeenCalledTimes(1);
      expect(checkOtx).toHaveBeenCalledTimes(1);
    });

    it('domain-only check\'ler çağrılmaz', async () => {
      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(checkSecurityHeaders).not.toHaveBeenCalled();
      expect(checkDnsRecords).not.toHaveBeenCalled();
      expect(checkRdap).not.toHaveBeenCalled();
      expect(checkRobotsTxt).not.toHaveBeenCalled();
      expect(checkPhishTank).not.toHaveBeenCalled();
      expect(checkBreachExposure).not.toHaveBeenCalled();
    });

    it('domain-only finding processor\'lar çağrılmaz', async () => {
      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(processSecurityHeaderFindings).not.toHaveBeenCalled();
      expect(processDnsFindings).not.toHaveBeenCalled();
      expect(processWhoisFindings).not.toHaveBeenCalled();
      expect(processRobotsFindings).not.toHaveBeenCalled();
      expect(processPhishTankFindings).not.toHaveBeenCalled();
      expect(processBreachFindings).not.toHaveBeenCalled();
    });

    it('domain-only snapshot tipleri yazılmaz', async () => {
      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      const types = (mockPrisma.scanCheckResult.create as jest.Mock).mock.calls.map(
        (c) => (c[0] as { data: { type: string } }).data.type,
      );
      expect(types).not.toContain('SECURITY_HEADERS');
      expect(types).not.toContain('DNS_RECORDS');
      expect(types).not.toContain('RDAP_INFO');
      expect(types).not.toContain('BREACH_EXPOSURE');
    });
  });

  // ─── 6. safeCheck crash isolation ────────────────────────────────────────

  describe('safeCheck crash isolation', () => {
    beforeEach(() => {
      mockPrisma.asset.findUnique.mockResolvedValue(makeAsset());
    });

    it('checkPorts throw ederse scan devam eder, ScanRun DONE olur', async () => {
      (checkPorts as jest.Mock).mockRejectedValue(new Error('socket error'));

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(true);
      expect(mockPrisma.scanRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }),
      );
    });

    it('checkPorts crash → fallback snapshot CHECK_CRASHED ile kaydedilir', async () => {
      (checkPorts as jest.Mock).mockRejectedValue(new Error('boom'));

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      const calls = (mockPrisma.scanCheckResult.create as jest.Mock).mock.calls;
      const portCall = calls.find((c) => (c[0] as { data: { type: string } }).data.type === 'PORTS');
      expect(portCall).toBeDefined();
      expect((portCall![0] as { data: { dataJson: { error: string } } }).data.dataJson.error).toBe('CHECK_CRASHED');
    });

    it('birden fazla check crash ederse scan devam eder', async () => {
      (checkPorts as jest.Mock).mockRejectedValue(new Error('port crash'));
      (checkTls as jest.Mock).mockRejectedValue(new Error('tls crash'));
      (checkDnsRecords as jest.Mock).mockRejectedValue(new Error('dns crash'));

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(true);
      expect(mockPrisma.scanRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }),
      );
    });

    it('check crash → diğer check\'ler hala çağrılır', async () => {
      (checkPorts as jest.Mock).mockRejectedValue(new Error('crash'));

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(checkTls).toHaveBeenCalled();
      expect(checkHttp).toHaveBeenCalled();
      expect(checkReputation).toHaveBeenCalled();
    });

    it('provider error (status:error) → ScanRun FAILED olmaz', async () => {
      (checkReputation as jest.Mock).mockResolvedValue({
        assetValue: 'example.com', assetType: 'DOMAIN', enabled: true, skipped: false,
        providers: [], isMalicious: false, maxScore: null, categories: [],
        checkedAt: '', error: 'ALL_PROVIDERS_FAILED',
      });

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(true);
      expect(mockPrisma.scanRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }),
      );
    });
  });

  // ─── 7. Snapshot allSettled izolasyonu ───────────────────────────────────

  describe('snapshot Promise.allSettled izolasyonu', () => {
    beforeEach(() => {
      mockPrisma.asset.findUnique.mockResolvedValue(makeAsset());
    });

    it('tek snapshot create hatası scan\'i FAILED yapmaz', async () => {
      let callCount = 0;
      (mockPrisma.scanCheckResult.create as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('DB timeout'));
        return Promise.resolve({});
      });

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(true);
      expect(mockPrisma.scanRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }),
      );
    });

    it('snapshot hatası loglanır', async () => {
      (mockPrisma.scanCheckResult.create as jest.Mock)
        .mockRejectedValueOnce(new Error('write failed'))
        .mockResolvedValue({});

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(log).toHaveBeenCalledWith('snapshot save failures', expect.objectContaining({ count: 1 }));
    });

    it('tüm snapshot\'lar hata verse bile scan DONE olur', async () => {
      (mockPrisma.scanCheckResult.create as jest.Mock).mockRejectedValue(new Error('full outage'));

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(true);
    });
  });

  // ─── 8. Finding processor try/catch izolasyonu ───────────────────────────

  describe('finding processor izolasyonu', () => {
    beforeEach(() => {
      mockPrisma.asset.findUnique.mockResolvedValue(makeAsset());
    });

    it('processPortFindings throw ederse diğer processor\'lar çalışır', async () => {
      (processPortFindings as jest.Mock).mockRejectedValue(new Error('db error'));

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(processTlsFindings).toHaveBeenCalled();
      expect(processHttpFindings).toHaveBeenCalled();
      expect(processGeoIpFindings).toHaveBeenCalled();
    });

    it('processDnsFindings throw ederse scan DONE olur', async () => {
      (processDnsFindings as jest.Mock).mockRejectedValue(new Error('dns processor crashed'));

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(true);
      expect(mockPrisma.scanRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }),
      );
    });

    it('tüm finding processor\'lar throw ederse scan DONE olur', async () => {
      (processPortFindings as jest.Mock).mockRejectedValue(new Error('crash'));
      (processTlsFindings as jest.Mock).mockRejectedValue(new Error('crash'));
      (processHttpFindings as jest.Mock).mockRejectedValue(new Error('crash'));
      (processDnsFindings as jest.Mock).mockRejectedValue(new Error('crash'));

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(true);
    });

    it('processor hatası loglanır', async () => {
      (processPortFindings as jest.Mock).mockRejectedValue(new Error('finding error'));

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(log).toHaveBeenCalledWith('findings:ports:error', expect.objectContaining({ error: 'finding error' }));
    });
  });

  // ─── 9. ScanRun status lifecycle ─────────────────────────────────────────

  describe('ScanRun status lifecycle', () => {
    it('başarılı scan → RUNNING sonra DONE', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(makeAsset());

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      const calls = (mockPrisma.scanRun.update as jest.Mock).mock.calls;
      const statuses = calls.map((c) => (c[0] as { data: { status: string } }).data.status);
      expect(statuses).toContain('RUNNING');
      expect(statuses).toContain('DONE');
      const runningIdx = statuses.indexOf('RUNNING');
      const doneIdx = statuses.lastIndexOf('DONE');
      expect(runningIdx).toBeLessThan(doneIdx);
    });

    it('kritik DB hatası (DONE update fail) → runScan throw eder', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(makeAsset());
      (mockPrisma.scanRun.update as jest.Mock).mockImplementation((args: { data: { status: string } }) => {
        if (args.data.status === 'DONE') return Promise.reject(new Error('DB connection lost'));
        return Promise.resolve({});
      });

      await expect(
        runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1')),
      ).rejects.toThrow('DB connection lost');
    });
  });

  // ─── 10. SQLi integration (Sprint E) ─────────────────────────────────────

  describe('SQLi integration', () => {
    beforeEach(() => {
      mockPrisma.asset.findUnique.mockResolvedValue(makeAsset('DOMAIN'));
    });

    it('ENABLE_SQLI_CHECK=false → checkSqli çağrılmaz, SQLI_PROBE snapshot DISABLED skipped olarak yazılır', async () => {
      // Env yok (beforeEach delete etti) → branch Promise.resolve(skipped DISABLED)

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(checkSqli).not.toHaveBeenCalled();

      const calls = (mockPrisma.scanCheckResult.create as jest.Mock).mock.calls;
      const sqliCall = calls.find((c) => (c[0] as { data: { type: string } }).data.type === 'SQLI_PROBE');
      expect(sqliCall).toBeDefined();
      const data = (sqliCall![0] as { data: { dataJson: { skipped: boolean; skipReason: string; enabled: boolean } } }).data.dataJson;
      expect(data.skipped).toBe(true);
      expect(data.skipReason).toBe('DISABLED');
      expect(data.enabled).toBe(false);
    });

    it('ENABLE_SQLI_CHECK=true → checkSqli bir kez çağrılır, SQLI_PROBE snapshot yazılır', async () => {
      process.env.ENABLE_SQLI_CHECK = 'true';

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(checkSqli).toHaveBeenCalledTimes(1);

      const calls = (mockPrisma.scanCheckResult.create as jest.Mock).mock.calls;
      const sqliCall = calls.find((c) => (c[0] as { data: { type: string } }).data.type === 'SQLI_PROBE');
      expect(sqliCall).toBeDefined();
    });

    it('ENABLE_SQLI_CHECK=true ile asset + prisma checkSqli\'ye geçirilir', async () => {
      process.env.ENABLE_SQLI_CHECK = 'true';

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(checkSqli).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({ id: 'asset-1', value: 'example.com', type: 'DOMAIN', status: 'VERIFIED' }),
      );
    });

    it('checkSqli reject → safeCheck fallback CHECK_CRASHED snapshot, scan DONE', async () => {
      process.env.ENABLE_SQLI_CHECK = 'true';
      (checkSqli as jest.Mock).mockRejectedValue(new Error('sqli boom'));

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(true);
      expect(mockPrisma.scanRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }),
      );

      const calls = (mockPrisma.scanCheckResult.create as jest.Mock).mock.calls;
      const sqliCall = calls.find((c) => (c[0] as { data: { type: string } }).data.type === 'SQLI_PROBE');
      expect(sqliCall).toBeDefined();
      const data = (sqliCall![0] as { data: { dataJson: { error: string } } }).data.dataJson;
      expect(data.error).toBe('CHECK_CRASHED');
    });

    it('processSqliFindings reject → scan DONE (per-processor try/catch izolasyonu)', async () => {
      process.env.ENABLE_SQLI_CHECK = 'true';
      (processSqliFindings as jest.Mock).mockRejectedValue(new Error('finding crash'));

      const result = await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(result.ok).toBe(true);
      expect(log).toHaveBeenCalledWith('findings:sqli:error', expect.objectContaining({ error: 'finding crash' }));
    });

    it('processSqliFindings her zaman çağrılır (skip mode dahil) — kendi guard\'ı handle eder', async () => {
      // Env yok → SQLi skipped DISABLED, ama processSqliFindings yine çağrılır
      // (processor kendi içinde skipped guard yapar — bkz. sqli.findings.ts)

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(processSqliFindings).toHaveBeenCalledTimes(1);
      // Skipped DISABLED sqliResult geçildi
      const call = (processSqliFindings as jest.Mock).mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({
        asset: expect.objectContaining({ id: 'asset-1' }),
        scanRunId: 'run-1',
        sqliResult: expect.objectContaining({ skipped: true, skipReason: 'DISABLED' }),
      }));
    });

    it('IP asset + ENABLE_SQLI_CHECK=true → checkSqli yine çağrılır (NOT_DOMAIN guard içeride)', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(makeAsset('IP'));
      process.env.ENABLE_SQLI_CHECK = 'true';
      // SQLi mock'ı kullanıcı (NOT_DOMAIN) skipped result döndürsün
      (checkSqli as jest.Mock).mockResolvedValue({
        enabled: true, skipped: true, skipReason: 'NOT_DOMAIN',
        targetCount: 0, testedParams: 0, suspectedCount: 0, results: [], checkedAt: '',
      });

      await runScan(mockPrisma as unknown as PrismaClient, makeJob('asset-1', 'run-1'));

      expect(checkSqli).toHaveBeenCalledTimes(1);
      const calls = (mockPrisma.scanCheckResult.create as jest.Mock).mock.calls;
      const sqliCall = calls.find((c) => (c[0] as { data: { type: string } }).data.type === 'SQLI_PROBE');
      expect(sqliCall).toBeDefined();
      const data = (sqliCall![0] as { data: { dataJson: { skipReason: string } } }).data.dataJson;
      expect(data.skipReason).toBe('NOT_DOMAIN');
    });
  });
});
