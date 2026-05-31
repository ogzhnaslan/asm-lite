import { BadRequestException } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';
import { OtxLookupService } from './otx-lookup.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AssistantLlmService } from '../assistant/assistant-llm.service';

const TEST_USER_ID = 'user-1';

const mockOtx: jest.Mocked<Pick<OtxLookupService, 'lookup'>> = {
  lookup: jest.fn(),
};

// passiveLookup, sonucu fire-and-forget olarak DB'ye yazar; create mock'u
// resolve etmesi yeterli (hata zaten servis içinde yutuluyor).
const mockPrisma = {
  passiveLookupRun: {
    create: jest.fn().mockResolvedValue({ id: 'run-1' }),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

const mockLlm: jest.Mocked<Pick<AssistantLlmService, 'chatWithSystem'>> = {
  chatWithSystem: jest.fn(),
};

function makeService() {
  return new IntelligenceService(
    mockOtx as unknown as OtxLookupService,
    mockPrisma as unknown as PrismaService,
    mockLlm as unknown as AssistantLlmService,
  );
}

const STUB_OTX_RESULT = {
  provider: 'alienvault-otx' as const,
  enabled: true,
  skipped: false,
  assetValue: 'example.com',
  assetType: 'DOMAIN' as const,
  pulseCount: 0,
  pulses: [],
  tags: [],
  malwareCount: 0,
  urlListCount: 0,
  passiveDnsCount: 0,
  checkedAt: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOtx.lookup.mockResolvedValue(STUB_OTX_RESULT);
});

describe('IntelligenceService.passiveLookup', () => {
  // ─── input validation ─────────────────────────────────────────────────────────

  it('boş target → BadRequestException', async () => {
    const service = makeService();
    await expect(service.passiveLookup('', TEST_USER_ID)).rejects.toThrow(BadRequestException);
  });

  it('sadece boşluk target → BadRequestException', async () => {
    const service = makeService();
    await expect(service.passiveLookup('   ', TEST_USER_ID)).rejects.toThrow(BadRequestException);
  });

  it('253 karakterden uzun target → BadRequestException', async () => {
    const service = makeService();
    const long = 'a'.repeat(254) + '.com';
    await expect(service.passiveLookup(long, TEST_USER_ID)).rejects.toThrow(BadRequestException);
  });

  it('geçersiz domain formatı → BadRequestException', async () => {
    const service = makeService();
    await expect(service.passiveLookup('not_a_domain', TEST_USER_ID)).rejects.toThrow(BadRequestException);
  });

  // ─── URL normalization ────────────────────────────────────────────────────────

  it('https:// prefix soyulur', async () => {
    const service = makeService();
    const result = await service.passiveLookup('https://example.com', TEST_USER_ID);
    expect(result.target).toBe('example.com');
  });

  it('http:// prefix soyulur', async () => {
    const service = makeService();
    const result = await service.passiveLookup('http://example.com', TEST_USER_ID);
    expect(result.target).toBe('example.com');
  });

  it('URL path soyulur', async () => {
    const service = makeService();
    const result = await service.passiveLookup('https://example.com/login?foo=bar', TEST_USER_ID);
    expect(result.target).toBe('example.com');
  });

  it('büyük harf → küçük harfe normalize edilir', async () => {
    const service = makeService();
    const result = await service.passiveLookup('Example.COM', TEST_USER_ID);
    expect(result.target).toBe('example.com');
  });

  // ─── type detection ───────────────────────────────────────────────────────────

  it('domain → targetType DOMAIN', async () => {
    const service = makeService();
    const result = await service.passiveLookup('example.com', TEST_USER_ID);
    expect(result.targetType).toBe('DOMAIN');
  });

  it('IPv4 → targetType IP', async () => {
    const service = makeService();
    mockOtx.lookup.mockResolvedValue({ ...STUB_OTX_RESULT, assetValue: '1.2.3.4', assetType: 'IP' });
    const result = await service.passiveLookup('1.2.3.4', TEST_USER_ID);
    expect(result.targetType).toBe('IP');
  });

  // ─── response shape ───────────────────────────────────────────────────────────

  it('response mode=PASSIVE_LOOKUP içerir', async () => {
    const service = makeService();
    const result = await service.passiveLookup('example.com', TEST_USER_ID);
    expect(result.mode).toBe('PASSIVE_LOOKUP');
  });

  it('response sources.otx içerir', async () => {
    const service = makeService();
    const result = await service.passiveLookup('example.com', TEST_USER_ID);
    expect(result.sources.otx).toBeDefined();
    expect(result.sources.otx.provider).toBe('alienvault-otx');
  });

  it('response target ve targetType içerir', async () => {
    const service = makeService();
    const result = await service.passiveLookup('example.com', TEST_USER_ID);
    expect(result.target).toBe('example.com');
    expect(result.targetType).toBe('DOMAIN');
  });

  it('response checkedAt ISO date içerir', async () => {
    const service = makeService();
    const result = await service.passiveLookup('example.com', TEST_USER_ID);
    expect(typeof result.checkedAt).toBe('string');
    expect(new Date(result.checkedAt).getTime()).not.toBeNaN();
  });

  // ─── construction & dependency wiring ─────────────────────────────────────────

  it('IntelligenceService 3 bağımlılıkla (OtxLookup + Prisma + LLM) kurulur', () => {
    // Constructor: (otxLookup, prisma, llmService). Hepsi sağlandığında throw etmez.
    expect(() => makeService()).not.toThrow();
  });

  it('passiveLookup sonucu fire-and-forget olarak DB\'ye yazılır (savePassiveLookupRun)', async () => {
    const service = makeService();
    await service.passiveLookup('example.com', TEST_USER_ID);
    // create async/fire-and-forget — microtask kuyruğunu boşalt
    await Promise.resolve();
    expect(mockPrisma.passiveLookupRun.create).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.passiveLookupRun.create.mock.calls[0][0];
    expect(arg.data.userId).toBe(TEST_USER_ID);
    expect(arg.data.target).toBe('example.com');
  });

  it('otxLookup.lookup doğru argümanlarla çağrılır', async () => {
    const service = makeService();
    await service.passiveLookup('example.com', TEST_USER_ID);
    expect(mockOtx.lookup).toHaveBeenCalledWith('example.com', 'DOMAIN');
  });

  it('IPv4 için otxLookup.lookup IP türüyle çağrılır', async () => {
    const service = makeService();
    mockOtx.lookup.mockResolvedValue({ ...STUB_OTX_RESULT, assetValue: '8.8.8.8', assetType: 'IP' });
    await service.passiveLookup('8.8.8.8', TEST_USER_ID);
    expect(mockOtx.lookup).toHaveBeenCalledWith('8.8.8.8', 'IP');
  });
});

describe('IntelligenceService.normalizeTarget', () => {
  it('port numarası soyulur', () => {
    const service = makeService();
    const { target } = service.normalizeTarget('example.com:8080');
    expect(target).toBe('example.com');
  });

  it('URL ile port → sadece hostname kalır', () => {
    const service = makeService();
    const { target } = service.normalizeTarget('https://example.com:443/path');
    expect(target).toBe('example.com');
  });
});
