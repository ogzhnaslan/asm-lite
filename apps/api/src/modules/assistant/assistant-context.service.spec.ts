import { Test, TestingModule } from '@nestjs/testing';
import { AssistantContextService } from './assistant-context.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockAsset = {
  value: 'example.com',
  type: 'DOMAIN',
  status: 'VERIFIED',
  critical: false,
  scanInterval: '24h',
};

const mockDoneRun = { id: 'run-done-1' };

const dnsDataJson = {
  domain: 'example.com',
  records: [
    { type: 'A', value: '1.2.3.4' },
    { type: 'MX', value: '10 mail.example.com' },
    { type: 'NS', value: 'ns1.example.com' },
    { type: 'NS', value: 'ns2.example.com' },
    { type: 'TXT', value: 'v=spf1 include:example.com ~all' },
  ],
  dmarcRecord: 'v=DMARC1; p=none;',
  errors: {},
  checkedAt: '2026-05-11T00:00:00.000Z',
};

const rdapDataJson = {
  domain: 'example.com',
  registrar: 'GoDaddy LLC',
  createdDate: '2020-01-01T00:00:00Z',
  updatedDate: '2025-01-01T00:00:00Z',
  expiresDate: '2027-01-01T00:00:00Z',
  nameServers: ['ns1.example.com', 'ns2.example.com'],
  status: ['client-delete-prohibited', 'client-transfer-prohibited'],
  rawSource: 'RDAP',
  checkedAt: '2026-05-11T00:00:00.000Z',
};

const geoIpDataJson = {
  assetValue: 'example.com',
  assetType: 'DOMAIN',
  resolvedIp: '1.2.3.4',
  country: 'Turkey',
  countryCode: 'TR',
  region: 'Istanbul',
  city: 'Istanbul',
  latitude: 41.01,
  longitude: 28.97,
  asn: 'AS12345',
  isp: 'Turk Telekom',
  organization: 'Example Corp',
  provider: 'ip-api',
  checkedAt: '2026-05-11T00:00:00.000Z',
};

const robotsDataJson = {
  domain: 'example.com',
  url: 'https://example.com/robots.txt',
  exists: true,
  statusCode: 200,
  contentLength: 512,
  contentHash: 'abc123',
  disallowRules: ['/admin', '/backup', '/.env', '/private'],
  allowRules: [],
  sitemapUrls: ['https://example.com/sitemap.xml'],
  sensitivePaths: ['/admin', '/backup', '/.env'],
  highSeverityPaths: ['/backup', '/.env'],
  checkedAt: '2026-05-11T00:00:00.000Z',
};

const phishTankDataJson = {
  domain: 'example.com',
  provider: 'phishtank',
  enabled: true,
  skipped: false,
  isListed: false,
  verifiedMatches: 0,
  onlineMatches: 0,
  matchedUrls: [],
  checkedAt: '2026-05-11T00:00:00.000Z',
};

const reputationDataJson = {
  assetValue: 'example.com',
  assetType: 'DOMAIN',
  enabled: true,
  skipped: false,
  providers: [{ name: 'urlhaus', status: 'ok', isMalicious: false, score: null, categories: [], reportCount: 0, lastReportedAt: null, matchedIndicators: [] }],
  isMalicious: false,
  maxScore: null,
  categories: [],
  checkedAt: '2026-05-11T00:00:00.000Z',
};

const breachDataJson = {
  domain: 'example.com',
  enabled: true,
  skipped: false,
  provider: 'mock',
  status: 'ok',
  breachCount: 2,
  exposedEmailsCount: 8,
  latestBreachDate: '2025-11-01T00:00:00.000Z',
  sources: ['MockBreach2025', 'DemoLeak2024'],
  sensitiveDataTypes: ['email', 'password_hash'],
  checkedAt: '2026-05-11T00:00:00.000Z',
};

const allSnapshots = [
  { type: 'DNS_RECORDS', dataJson: dnsDataJson },
  { type: 'RDAP_INFO', dataJson: rdapDataJson },
  { type: 'GEOIP_INFO', dataJson: geoIpDataJson },
  { type: 'ROBOTS_TXT', dataJson: robotsDataJson },
  { type: 'PHISHTANK_REPUTATION', dataJson: phishTankDataJson },
  { type: 'MALICIOUS_REPUTATION', dataJson: reputationDataJson },
  { type: 'BREACH_EXPOSURE', dataJson: breachDataJson },
];

function makeMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    scanRun: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(mockDoneRun),
      ...((overrides.scanRun as object | undefined) ?? {}),
    },
    finding: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      ...((overrides.finding as object | undefined) ?? {}),
    },
    scanCheckResult: {
      findMany: jest.fn().mockResolvedValue(allSnapshots),
      ...((overrides.scanCheckResult as object | undefined) ?? {}),
    },
  };
}

describe('AssistantContextService', () => {
  let service: AssistantContextService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(async () => {
    mockPrisma = makeMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantContextService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AssistantContextService>(AssistantContextService);
  });

  it('tanımlı olmalı', () => {
    expect(service).toBeDefined();
  });

  describe('1 — En güncel DONE snapshot özeti context\'e girer', () => {
    it('DNS kaydı sayıları ve DMARC doğru hesaplanır', async () => {
      const ctx = await service.build('asset-1', mockAsset);

      expect(ctx.hasIntelligence).toBe(true);
      expect(ctx.intelligence.dns).not.toBeNull();
      expect(ctx.intelligence.dns!.totalRecords).toBe(5);
      expect(ctx.intelligence.dns!.a).toBe(1);
      expect(ctx.intelligence.dns!.mx).toBe(1);
      expect(ctx.intelligence.dns!.ns).toBe(2);
      expect(ctx.intelligence.dns!.txt).toBe(1);
      expect(ctx.intelligence.dns!.caa).toBe(0);
      expect(ctx.intelligence.dns!.hasDmarc).toBe(true);
      expect(ctx.intelligence.dns!.errorCount).toBe(0);
    });

    it('RDAP özeti doğru alanları içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);

      expect(ctx.intelligence.rdap).not.toBeNull();
      expect(ctx.intelligence.rdap!.registrar).toBe('GoDaddy LLC');
      expect(ctx.intelligence.rdap!.expiresDate).toBe('2027-01-01T00:00:00Z');
      expect(ctx.intelligence.rdap!.nameServerCount).toBe(2);
      expect(ctx.intelligence.rdap!.statusCount).toBe(2);
      expect(ctx.intelligence.rdap!.hasError).toBe(false);
    });

    it('GeoIP özeti doğru alanları içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);

      expect(ctx.intelligence.geoip).not.toBeNull();
      expect(ctx.intelligence.geoip!.resolvedIp).toBe('1.2.3.4');
      expect(ctx.intelligence.geoip!.country).toBe('Turkey');
      expect(ctx.intelligence.geoip!.countryCode).toBe('TR');
      expect(ctx.intelligence.geoip!.city).toBe('Istanbul');
      expect(ctx.intelligence.geoip!.asn).toBe('AS12345');
      expect(ctx.intelligence.geoip!.isp).toBe('Turk Telekom');
      expect(ctx.intelligence.geoip!.organization).toBe('Example Corp');
    });

    it('Robots özeti doğru sayıları içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);

      expect(ctx.intelligence.robots).not.toBeNull();
      expect(ctx.intelligence.robots!.exists).toBe(true);
      expect(ctx.intelligence.robots!.disallowCount).toBe(4);
      expect(ctx.intelligence.robots!.sitemapCount).toBe(1);
      expect(ctx.intelligence.robots!.sensitivePathCount).toBe(3);
      expect(ctx.intelligence.robots!.highSeverityPathCount).toBe(2);
    });

    it('PhishTank özeti doğru alanları içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);

      expect(ctx.intelligence.phishtank).not.toBeNull();
      expect(ctx.intelligence.phishtank!.skipped).toBe(false);
      expect(ctx.intelligence.phishtank!.isListed).toBe(false);
      expect(ctx.intelligence.phishtank!.verifiedMatches).toBe(0);
      expect(ctx.intelligence.phishtank!.matchedUrlCount).toBe(0);
    });

    it('Reputation özeti doğru alanları içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);

      expect(ctx.intelligence.reputation).not.toBeNull();
      expect(ctx.intelligence.reputation!.skipped).toBe(false);
      expect(ctx.intelligence.reputation!.isMalicious).toBe(false);
      expect(ctx.intelligence.reputation!.providerCount).toBe(1);
    });

    it('Breach özeti doğru alanları içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);

      expect(ctx.intelligence.breach).not.toBeNull();
      expect(ctx.intelligence.breach!.breachCount).toBe(2);
      expect(ctx.intelligence.breach!.exposedEmailsCount).toBe(8);
      expect(ctx.intelligence.breach!.provider).toBe('mock');
      expect(ctx.intelligence.breach!.sensitiveDataTypes).toEqual(['email', 'password_hash']);
      expect(ctx.intelligence.breach!.latestBreachDate).toBe('2025-11-01T00:00:00.000Z');
    });

    it('scanCheckResult.findMany sadece DONE run id ile çağrılır', async () => {
      await service.build('asset-1', mockAsset);

      expect(mockPrisma.scanCheckResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ scanRunId: 'run-done-1' }) }),
      );
    });
  });

  describe('2 — DONE olmayan scanRun snapshotları dikkate alınmaz', () => {
    it('DONE run yoksa snapshotlar sorgulanmaz ve intelligence null kalır', async () => {
      mockPrisma.scanRun.findFirst.mockResolvedValue(null);

      const ctx = await service.build('asset-1', mockAsset);

      expect(mockPrisma.scanCheckResult.findMany).not.toHaveBeenCalled();
      expect(ctx.hasIntelligence).toBe(false);
      expect(ctx.intelligence.dns).toBeNull();
      expect(ctx.intelligence.rdap).toBeNull();
      expect(ctx.intelligence.geoip).toBeNull();
      expect(ctx.intelligence.robots).toBeNull();
      expect(ctx.intelligence.phishtank).toBeNull();
      expect(ctx.intelligence.reputation).toBeNull();
      expect(ctx.intelligence.breach).toBeNull();
    });
  });

  describe('3 — DNS records undefined olduğunda crash olmaz', () => {
    it('records alanı eksik dataJson → sıfır değerlerle döner', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([
        { type: 'DNS_RECORDS', dataJson: { domain: 'example.com', checkedAt: '2026-05-11T00:00:00.000Z', errors: {} } },
      ]);

      const ctx = await service.build('asset-1', mockAsset);

      expect(ctx.intelligence.dns).not.toBeNull();
      expect(ctx.intelligence.dns!.totalRecords).toBe(0);
      expect(ctx.intelligence.dns!.a).toBe(0);
      expect(ctx.intelligence.dns!.mx).toBe(0);
      expect(ctx.intelligence.dns!.ns).toBe(0);
      expect(ctx.intelligence.dns!.txt).toBe(0);
      expect(ctx.intelligence.dns!.caa).toBe(0);
      expect(ctx.intelligence.dns!.hasDmarc).toBe(false);
      expect(ctx.intelligence.dns!.errorCount).toBe(0);
    });

    it('errors alanı eksik dataJson → crash olmaz', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([
        { type: 'DNS_RECORDS', dataJson: { domain: 'example.com', records: [], checkedAt: '2026-05-11T00:00:00.000Z' } },
      ]);

      await expect(service.build('asset-1', mockAsset)).resolves.not.toThrow();
    });

    it('nameServers ve status undefined olan RDAP → crash olmaz', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([
        { type: 'RDAP_INFO', dataJson: { domain: 'example.com', registrar: null, checkedAt: '2026-05-11T00:00:00.000Z' } },
      ]);

      const ctx = await service.build('asset-1', mockAsset);
      expect(ctx.intelligence.rdap!.nameServerCount).toBe(0);
      expect(ctx.intelligence.rdap!.statusCount).toBe(0);
    });
  });

  describe('4 — Hassas alanlar context\'e dahil edilmez', () => {
    it('apiKey, token, credentials alanları DNS özetine yansımaz', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([
        {
          type: 'DNS_RECORDS',
          dataJson: {
            ...dnsDataJson,
            apiKey: 'secret-api-key-12345',
            token: 'bearer-token-xyz',
            credentials: { username: 'admin', password: 'hunter2' },
          },
        },
      ]);

      const ctx = await service.build('asset-1', mockAsset);
      const dns = ctx.intelligence.dns!;

      const keys = Object.keys(dns);
      expect(keys).not.toContain('apiKey');
      expect(keys).not.toContain('token');
      expect(keys).not.toContain('credentials');
    });

    it('formatForPrompt çıktısı hassas değerler içermez', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([
        {
          type: 'DNS_RECORDS',
          dataJson: { ...dnsDataJson, apiKey: 'secret-api-key-12345', token: 'bearer-token-xyz' },
        },
      ]);

      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'test sorusu');

      expect(prompt).not.toContain('secret-api-key-12345');
      expect(prompt).not.toContain('bearer-token-xyz');
    });

    it('categories max 5 eleman ile kırpılır', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([
        {
          type: 'MALICIOUS_REPUTATION',
          dataJson: {
            ...reputationDataJson,
            categories: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
          },
        },
      ]);

      const ctx = await service.build('asset-1', mockAsset);
      expect(ctx.intelligence.reputation!.categories).toHaveLength(5);
    });

    it('sensitiveDataTypes max 5 eleman ile kırpılır', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([
        {
          type: 'BREACH_EXPOSURE',
          dataJson: {
            ...breachDataJson,
            sensitiveDataTypes: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
          },
        },
      ]);

      const ctx = await service.build('asset-1', mockAsset);
      expect(ctx.intelligence.breach!.sensitiveDataTypes).toHaveLength(5);
    });
  });

  describe('5 — Hiç snapshot yoksa intelligence null, hasIntelligence false', () => {
    it('DONE run var ama snapshot dönmüyorsa tüm alanlar null', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([]);

      const ctx = await service.build('asset-1', mockAsset);

      expect(ctx.hasIntelligence).toBe(false);
      expect(Object.values(ctx.intelligence).every((v) => v === null)).toBe(true);
    });

    it('DONE run hiç yoksa hasIntelligence false', async () => {
      mockPrisma.scanRun.findFirst.mockResolvedValue(null);

      const ctx = await service.build('asset-1', mockAsset);

      expect(ctx.hasIntelligence).toBe(false);
    });

    it('hasIntelligence tek bir dolu alan varsa true olur', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([
        { type: 'GEOIP_INFO', dataJson: geoIpDataJson },
      ]);

      const ctx = await service.build('asset-1', mockAsset);

      expect(ctx.hasIntelligence).toBe(true);
      expect(ctx.intelligence.geoip).not.toBeNull();
      expect(ctx.intelligence.dns).toBeNull();
      expect(ctx.intelligence.rdap).toBeNull();
    });
  });

  describe('6 — formatForPrompt Türkçe intelligence bölümleri içerir', () => {
    it('DNS bölümü Türkçe başlık ve verilerle yer alır', async () => {
      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'test sorusu');

      expect(prompt).toContain('=== DNS KAYITLARI ===');
      expect(prompt).toContain('Toplam kayıt: 5');
      expect(prompt).toContain('DMARC: Mevcut');
    });

    it('RDAP bölümü Türkçe başlık ve kayıt şirketi içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'test sorusu');

      expect(prompt).toContain('=== ALAN ADI KAYIT BİLGİSİ ===');
      expect(prompt).toContain('GoDaddy LLC');
    });

    it('GeoIP bölümü Türkçe başlık ve konum içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'test sorusu');

      expect(prompt).toContain('=== COĞRAFYA / IP BİLGİSİ ===');
      expect(prompt).toContain('Turkey');
      expect(prompt).toContain('(TR)');
    });

    it('Robots bölümü Türkçe başlık ve sayılar içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'test sorusu');

      expect(prompt).toContain('=== ROBOTS.TXT ANALİZİ ===');
      expect(prompt).toContain('Yüksek riskli path sayısı: 2');
    });

    it('PhishTank bölümü Türkçe başlık içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'test sorusu');

      expect(prompt).toContain('=== PHİSHTANK İTİBAR KONTROLÜ ===');
    });

    it('İtibar bölümü Türkçe başlık içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'test sorusu');

      expect(prompt).toContain('=== İTİBAR ANALİZİ ===');
    });

    it('Veri sızıntısı bölümü Türkçe başlık ve breach sayısı içerir', async () => {
      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'test sorusu');

      expect(prompt).toContain('=== VERİ SIZMASI KONTROLÜ ===');
      expect(prompt).toContain('Sızıntı sayısı: 2');
    });

    it('intelligence yoksa fallback Türkçe mesaj gösterilir', async () => {
      mockPrisma.scanRun.findFirst.mockResolvedValue(null);

      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'test sorusu');

      expect(prompt).toContain('Henüz yok — önce tarama başlatın');
    });

    it('kullanıcı sorusu prompta dahil edilir', async () => {
      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'DNS kayıtlarım güvenli mi?');

      expect(prompt).toContain('=== KULLANICININ SORUSU ===');
      expect(prompt).toContain('DNS kayıtlarım güvenli mi?');
    });
  });

  describe('Skipped / Error durumları', () => {
    it('PhishTank skipped → "Atlandı" mesajı formatForPrompt\'ta görünür', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([
        { type: 'PHISHTANK_REPUTATION', dataJson: { ...phishTankDataJson, skipped: true, enabled: false } },
      ]);

      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'soru');

      expect(ctx.intelligence.phishtank!.skipped).toBe(true);
      expect(prompt).toContain('Atlandı');
    });

    it('Breach status=error → hata mesajı formatForPrompt\'ta görünür', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([
        { type: 'BREACH_EXPOSURE', dataJson: { ...breachDataJson, status: 'error', error: 'HIBP_TIMEOUT' } },
      ]);

      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'soru');

      expect(ctx.intelligence.breach!.hasError).toBe(true);
      expect(prompt).toContain('Hata — veri alınamadı');
    });

    it('RDAP hasError → Uyarı mesajı formatForPrompt\'ta görünür', async () => {
      mockPrisma.scanCheckResult.findMany.mockResolvedValue([
        { type: 'RDAP_INFO', dataJson: { ...rdapDataJson, error: 'RDAP_TIMEOUT' } },
      ]);

      const ctx = await service.build('asset-1', mockAsset);
      const prompt = service.formatForPrompt(ctx, 'soru');

      expect(ctx.intelligence.rdap!.hasError).toBe(true);
      expect(prompt).toContain('Uyarı: Veri alınırken hata oluştu');
    });
  });
});
