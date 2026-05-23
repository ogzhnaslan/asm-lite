import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScanScheduleService } from '../modules/scans/scan-schedule.service';
import * as dnsModule from 'node:dns/promises';

jest.mock('node:dns/promises', () => ({
  resolveTxt: jest.fn(),
  setServers: jest.fn(),
}));

const mockAsset = {
  id: 'asset-1',
  userId: 'user-1',
  type: 'DOMAIN',
  value: 'example.com',
  status: 'PENDING',
  critical: false,
  scanInterval: '24h',
  createdAt: new Date(),
};

const mockVerifiedAsset = { ...mockAsset, status: 'VERIFIED' };

describe('AssetsService', () => {
  let service: AssetsService;
  let prismaAsset: {
    create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock;
    findUnique: jest.Mock; count: jest.Mock; update: jest.Mock; delete: jest.Mock;
  };
  let prismaFinding: { deleteMany: jest.Mock };
  let prismaScanRun: { deleteMany: jest.Mock };
  let prismaAssetVerification: { create: jest.Mock; deleteMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  let prismaScanCheckResult: { findFirst: jest.Mock };
  let prismaTransaction: jest.Mock;
  let scheduleService: { schedule: jest.Mock; unschedule: jest.Mock };

  beforeEach(async () => {
    prismaAsset = {
      create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(),
      findUnique: jest.fn(), count: jest.fn(), update: jest.fn(), delete: jest.fn(),
    };
    prismaFinding = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
    prismaScanRun = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
    prismaAssetVerification = {
      create: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    };
    prismaScanCheckResult = { findFirst: jest.fn().mockResolvedValue(null) };
    prismaTransaction = jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    scheduleService = {
      schedule: jest.fn().mockResolvedValue(undefined),
      unschedule: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        {
          provide: PrismaService,
          useValue: {
            asset: prismaAsset,
            finding: prismaFinding,
            scanRun: prismaScanRun,
            assetVerification: prismaAssetVerification,
            scanCheckResult: prismaScanCheckResult,
            $transaction: prismaTransaction,
          },
        },
        { provide: ScanScheduleService, useValue: scheduleService },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('geçerli DOMAIN oluşturulur', async () => {
      prismaAsset.create.mockResolvedValue(mockAsset);

      const result = await service.create('user-1', { value: 'Example.COM' });

      expect(result).toEqual(mockAsset);
      expect(prismaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ value: 'example.com', type: 'DOMAIN' }) }),
      );
    });

    it('geçerli IP oluşturulur', async () => {
      const ipAsset = { ...mockAsset, type: 'IP', value: '192.168.1.1' };
      prismaAsset.create.mockResolvedValue(ipAsset);

      const result = await service.create('user-1', { type: 'IP', value: '192.168.1.1' });

      expect(result.type).toBe('IP');
    });

    it('value boş → BadRequestException', async () => {
      await expect(service.create('user-1', { value: '' })).rejects.toThrow(BadRequestException);
    });

    it('domain\'de http:// yazılırsa → BadRequestException', async () => {
      await expect(service.create('user-1', { value: 'http://example.com' })).rejects.toThrow(BadRequestException);
    });

    it('domain\'de https:// yazılırsa → BadRequestException', async () => {
      await expect(service.create('user-1', { value: 'https://example.com' })).rejects.toThrow(BadRequestException);
    });

    it('geçersiz IP formatı → BadRequestException', async () => {
      await expect(service.create('user-1', { type: 'IP', value: '999.1.1.1' })).rejects.toThrow(BadRequestException);
    });

    it('IP oktet sayısı eksik → BadRequestException', async () => {
      await expect(service.create('user-1', { type: 'IP', value: '192.168.1' })).rejects.toThrow(BadRequestException);
    });

    it('aynı asset tekrar eklenirse → ConflictException', async () => {
      prismaAsset.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.create('user-1', { value: 'example.com' })).rejects.toThrow(ConflictException);
    });
  });

  // ─── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('{ items, total, page, limit } formatında döner', async () => {
      prismaAsset.findMany.mockResolvedValue([mockAsset]);
      prismaAsset.count.mockResolvedValue(1);

      const result = await service.list('user-1');

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('page=2, limit=5 → doğru skip hesaplanır', async () => {
      prismaAsset.findMany.mockResolvedValue([]);
      prismaAsset.count.mockResolvedValue(0);

      await service.list('user-1', { page: 2, limit: 5 });

      expect(prismaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  // ─── get ─────────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('asset döner', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);

      const result = await service.get('user-1', 'asset-1');

      expect(result).toEqual(mockAsset);
    });

    it('bulunamazsa → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);

      await expect(service.get('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('başarılı silme → schedule iptal edilir, transaction çalışır', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaAsset.delete.mockResolvedValue(mockAsset);

      const result = await service.remove('user-1', 'asset-1');

      expect(result).toEqual({ ok: true, assetId: 'asset-1' });
      expect(scheduleService.unschedule).toHaveBeenCalledWith('asset-1');
      expect(prismaTransaction).toHaveBeenCalled();
      expect(prismaFinding.deleteMany).toHaveBeenCalledWith({ where: { assetId: 'asset-1' } });
      expect(prismaAsset.delete).toHaveBeenCalledWith({ where: { id: 'asset-1' } });
    });

    it('asset bulunamazsa → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);

      await expect(service.remove('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
      expect(scheduleService.unschedule).not.toHaveBeenCalled();
    });
  });

  // ─── setCritical ─────────────────────────────────────────────────────────────

  describe('setCritical', () => {
    it('critical=true olarak set edilir', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaAsset.update.mockResolvedValue({ ...mockAsset, critical: true });

      const result = await service.setCritical('user-1', 'asset-1', true);

      expect(result).toEqual({ ok: true, assetId: 'asset-1', critical: true });
      expect(prismaAsset.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { critical: true } }),
      );
    });

    it('critical=false olarak set edilir', async () => {
      prismaAsset.findFirst.mockResolvedValue({ ...mockAsset, critical: true });
      prismaAsset.update.mockResolvedValue({ ...mockAsset, critical: false });

      const result = await service.setCritical('user-1', 'asset-1', false);

      expect(result.critical).toBe(false);
    });

    it('boolean dışında değer → BadRequestException', async () => {
      await expect(service.setCritical('user-1', 'asset-1', 'yes' as any)).rejects.toThrow(BadRequestException);
    });

    it('asset bulunamazsa → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);

      await expect(service.setCritical('user-1', 'asset-1', true)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateScanInterval ──────────────────────────────────────────────────────

  describe('updateScanInterval', () => {
    it('geçerli interval set edilir', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaAsset.update.mockResolvedValue({ ...mockAsset, scanInterval: '6h' });

      const result = await service.updateScanInterval('user-1', 'asset-1', '6h');

      expect(result).toEqual({ ok: true, assetId: 'asset-1', scanInterval: '6h' });
    });

    it('VERIFIED asset → schedule yeniden kurulur', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockVerifiedAsset);
      prismaAsset.update.mockResolvedValue({ ...mockVerifiedAsset, scanInterval: '1h' });

      await service.updateScanInterval('user-1', 'asset-1', '1h');

      expect(scheduleService.schedule).toHaveBeenCalledWith('asset-1', '1h');
    });

    it('PENDING asset → schedule kurulmaz', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaAsset.update.mockResolvedValue({ ...mockAsset, scanInterval: '1h' });

      await service.updateScanInterval('user-1', 'asset-1', '1h');

      expect(scheduleService.schedule).not.toHaveBeenCalled();
    });

    it('geçersiz interval → BadRequestException', async () => {
      await expect(service.updateScanInterval('user-1', 'asset-1', '2h')).rejects.toThrow(BadRequestException);
    });

    it('asset bulunamazsa → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);

      await expect(service.updateScanInterval('user-1', 'asset-1', '24h')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── requestHttpToken ────────────────────────────────────────────────────────

  describe('requestHttpToken', () => {
    it('token ve talimat döner', async () => {
      prismaAsset.findUnique.mockResolvedValue(mockAsset);
      prismaAssetVerification.create.mockResolvedValue({ id: 'v-1' });

      const result = await service.requestHttpToken('user-1', 'asset-1');

      expect(result.method).toBe('HTTP_FILE');
      expect(result.token).toMatch(/^[a-f0-9]{32}$/);
      expect(result.instruction).toContain('example.com');
    });

    it('asset bulunamazsa → NotFoundException', async () => {
      prismaAsset.findUnique.mockResolvedValue(null);

      await expect(service.requestHttpToken('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('başka kullanıcının asset\'ine HTTP token istenemez → NotFoundException', async () => {
      prismaAsset.findUnique.mockResolvedValue({ ...mockAsset, userId: 'user-2' });

      await expect(service.requestHttpToken('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('token DB\'ye HTTP_FILE method ile kaydedilir', async () => {
      prismaAsset.findUnique.mockResolvedValue(mockAsset);
      prismaAssetVerification.create.mockResolvedValue({ id: 'v-1' });

      await service.requestHttpToken('user-1', 'asset-1');

      expect(prismaAssetVerification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assetId: 'asset-1', method: 'HTTP_FILE', token: expect.any(String) }),
        }),
      );
    });

    it('instruction well-known path içerir', async () => {
      prismaAsset.findUnique.mockResolvedValue(mockAsset);
      prismaAssetVerification.create.mockResolvedValue({ id: 'v-1' });

      const result = await service.requestHttpToken('user-1', 'asset-1');

      expect(result.instruction).toContain('.well-known/asm-verify.txt');
    });
  });

  // ─── requestDnsToken ─────────────────────────────────────────────────────────

  describe('requestDnsToken', () => {
    it('DOMAIN asset için DNS token ve talimat döner', async () => {
      prismaAsset.findUnique.mockResolvedValue(mockAsset);
      prismaAssetVerification.create.mockResolvedValue({ id: 'v-1' });

      const result = await service.requestDnsToken('user-1', 'asset-1');

      expect(result.method).toBe('DNS_TXT');
      expect(result.dns.type).toBe('TXT');
      expect(result.dns.fqdn).toBe('_asm-verify.example.com');
    });

    it('IP asset için DNS token → BadRequestException', async () => {
      prismaAsset.findUnique.mockResolvedValue({ ...mockAsset, type: 'IP' });

      await expect(service.requestDnsToken('user-1', 'asset-1')).rejects.toThrow(BadRequestException);
    });

    it('asset bulunamazsa → NotFoundException', async () => {
      prismaAsset.findUnique.mockResolvedValue(null);

      await expect(service.requestDnsToken('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('başka kullanıcının asset\'ine DNS token istenemez → NotFoundException', async () => {
      prismaAsset.findUnique.mockResolvedValue({ ...mockAsset, userId: 'user-2' });

      await expect(service.requestDnsToken('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('token DB\'ye DNS_TXT method ile kaydedilir', async () => {
      prismaAsset.findUnique.mockResolvedValue(mockAsset);
      prismaAssetVerification.create.mockResolvedValue({ id: 'v-1' });

      await service.requestDnsToken('user-1', 'asset-1');

      expect(prismaAssetVerification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assetId: 'asset-1', method: 'DNS_TXT', token: expect.any(String) }),
        }),
      );
    });

    it('instruction _asm-verify host ve asm-verify= prefix içerir', async () => {
      prismaAsset.findUnique.mockResolvedValue(mockAsset);
      prismaAssetVerification.create.mockResolvedValue({ id: 'v-1' });

      const result = await service.requestDnsToken('user-1', 'asset-1');

      expect(result.instruction).toContain('_asm-verify');
      expect(result.instruction).toContain('asm-verify=');
      expect(result.dns.fqdn).toBe('_asm-verify.example.com');
    });

    // ─── Idempotency (Sprint 1B+ fix) ───────────────────────────────────────────

    it('aktif (verifiedAt=null) DNS_TXT verification varsa aynı token döndürülür', async () => {
      prismaAsset.findUnique.mockResolvedValue(mockAsset);
      prismaAssetVerification.findFirst.mockResolvedValue({
        id: 'v-existing',
        token: 'existing-dns-token-abc123',
      });

      const result = await service.requestDnsToken('user-1', 'asset-1');

      expect(result.token).toBe('existing-dns-token-abc123');
      expect(result.dns.value).toBe('asm-verify=existing-dns-token-abc123');
      expect(prismaAssetVerification.create).not.toHaveBeenCalled();
    });

    it('aktif DNS_TXT verification yoksa yeni token üretilir ve DB\'ye kaydedilir', async () => {
      prismaAsset.findUnique.mockResolvedValue(mockAsset);
      prismaAssetVerification.findFirst.mockResolvedValue(null);
      prismaAssetVerification.create.mockResolvedValue({ id: 'v-new' });

      const result = await service.requestDnsToken('user-1', 'asset-1');

      expect(result.token).toMatch(/^[a-f0-9]{32}$/);
      expect(prismaAssetVerification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assetId: 'asset-1', method: 'DNS_TXT', token: result.token }),
        }),
      );
    });

    it('findFirst sadece verifiedAt=null olan kayıtları arar (eski verified kayıt etkilemez)', async () => {
      prismaAsset.findUnique.mockResolvedValue(mockAsset);
      prismaAssetVerification.findFirst.mockResolvedValue(null);
      prismaAssetVerification.create.mockResolvedValue({ id: 'v-new' });

      await service.requestDnsToken('user-1', 'asset-1');

      expect(prismaAssetVerification.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assetId: 'asset-1',
            method: 'DNS_TXT',
            verifiedAt: null,
          }),
        }),
      );
    });

    it('asset zaten VERIFIED ise BadRequestException atar ve token üretmez', async () => {
      prismaAsset.findUnique.mockResolvedValue(mockVerifiedAsset);

      await expect(service.requestDnsToken('user-1', 'asset-1')).rejects.toThrow(BadRequestException);
      expect(prismaAssetVerification.findFirst).not.toHaveBeenCalled();
      expect(prismaAssetVerification.create).not.toHaveBeenCalled();
    });
  });

  // ─── getIntelligence ─────────────────────────────────────────────────────────

  describe('getIntelligence', () => {
    const mockSnapshot = (data: Record<string, unknown>) => ({
      dataJson: data,
      createdAt: new Date('2026-05-09T12:00:00.000Z'),
    });

    it('asset bulunamazsa → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);

      await expect(service.getIntelligence('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('tüm snapshot null → alanlar null, lastUpdatedAt null döner', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaScanCheckResult.findFirst.mockResolvedValue(null);

      const result = await service.getIntelligence('user-1', 'asset-1');

      expect(result.assetId).toBe('asset-1');
      expect(result.assetValue).toBe('example.com');
      expect(result.assetType).toBe('DOMAIN');
      expect(result.dns).toBeNull();
      expect(result.rdap).toBeNull();
      expect(result.geoip).toBeNull();
      expect(result.robots).toBeNull();
      expect(result.phishtank).toBeNull();
      expect(result.reputation).toBeNull();
      expect(result.breach).toBeNull();
      expect(result.lastUpdatedAt).toBeNull();
    });

    it('snapshot varsa dataJson döner ve lastUpdatedAt hesaplanır', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaScanCheckResult.findFirst.mockResolvedValue(mockSnapshot({ domain: 'example.com' }));

      const result = await service.getIntelligence('user-1', 'asset-1');

      expect(result.dns).toEqual({ domain: 'example.com' });
      expect(result.lastUpdatedAt).toBe('2026-05-09T12:00:00.000Z');
    });

    it('lastUpdatedAt en son snapshot tarihidir', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);

      const older = { dataJson: { a: 1 }, createdAt: new Date('2026-05-01T00:00:00.000Z') };
      const newer = { dataJson: { b: 2 }, createdAt: new Date('2026-05-09T12:00:00.000Z') };

      prismaScanCheckResult.findFirst
        .mockResolvedValueOnce(newer)   // DNS_RECORDS
        .mockResolvedValueOnce(older)   // RDAP_INFO
        .mockResolvedValue(null);       // rest

      const result = await service.getIntelligence('user-1', 'asset-1');

      expect(result.lastUpdatedAt).toBe('2026-05-09T12:00:00.000Z');
    });

    it('8 adet scanCheckResult.findFirst çağrılır (OTX_INTELLIGENCE dahil)', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaScanCheckResult.findFirst.mockResolvedValue(null);

      await service.getIntelligence('user-1', 'asset-1');

      expect(prismaScanCheckResult.findFirst).toHaveBeenCalledTimes(8);
    });

    it('sorgu DONE ScanRun ile filtrelenir', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaScanCheckResult.findFirst.mockResolvedValue(null);

      await service.getIntelligence('user-1', 'asset-1');

      expect(prismaScanCheckResult.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scanRun: expect.objectContaining({ assetId: 'asset-1', status: 'DONE' }),
          }),
        })
      );
    });
  });

  // ─── verifyHttp ──────────────────────────────────────────────────────────────

  describe('verifyHttp', () => {
    const TOKEN = 'aabbccddeeff00112233445566778899';
    const VERIFY_URL = 'https://example.com/.well-known/asm-verify.txt';

    const assetWithVerification = {
      ...mockAsset,
      verifications: [{ id: 'v-http-1', token: TOKEN, createdAt: new Date() }],
    };

    function mockFetchOk(body: string) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(body),
      } as any);
    }

    afterEach(() => {
      // restore fetch to avoid leaking into other tests
      delete (global as any).fetch;
    });

    it('başka kullanıcının asset\'i → NotFoundException', async () => {
      prismaAsset.findUnique.mockResolvedValue({ ...assetWithVerification, userId: 'user-2' });

      await expect(service.verifyHttp('user-1', 'asset-1', VERIFY_URL)).rejects.toThrow(NotFoundException);
    });

    it('asset bulunamazsa → NotFoundException', async () => {
      prismaAsset.findUnique.mockResolvedValue(null);

      await expect(service.verifyHttp('user-1', 'asset-1', VERIFY_URL)).rejects.toThrow(NotFoundException);
    });

    it('geçersiz URL formatı → BadRequestException', async () => {
      prismaAsset.findUnique.mockResolvedValue(assetWithVerification);

      await expect(service.verifyHttp('user-1', 'asset-1', 'not-a-url')).rejects.toThrow(BadRequestException);
    });

    it('URL hostname asset ile eşleşmiyor (SSRF koruma) → BadRequestException', async () => {
      prismaAsset.findUnique.mockResolvedValue(assetWithVerification);

      await expect(
        service.verifyHttp('user-1', 'asset-1', 'https://evil.com/.well-known/asm-verify.txt'),
      ).rejects.toThrow(BadRequestException);
    });

    it('http:// veya https:// dışı protokol → BadRequestException', async () => {
      prismaAsset.findUnique.mockResolvedValue(assetWithVerification);

      await expect(
        service.verifyHttp('user-1', 'asset-1', 'ftp://example.com/token.txt'),
      ).rejects.toThrow(BadRequestException);
    });

    it('verification token yoksa → BadRequestException', async () => {
      prismaAsset.findUnique.mockResolvedValue({ ...mockAsset, verifications: [] });

      await expect(service.verifyHttp('user-1', 'asset-1', VERIFY_URL)).rejects.toThrow(BadRequestException);
    });

    it('HTTP response body token içeriyorsa → VERIFIED yapılır, schedule kurulur', async () => {
      prismaAsset.findUnique.mockResolvedValue(assetWithVerification);
      prismaAsset.update.mockResolvedValue({ ...mockAsset, status: 'VERIFIED' });
      mockFetchOk(TOKEN);

      const result = await service.verifyHttp('user-1', 'asset-1', VERIFY_URL);

      expect(result).toEqual({ ok: true, assetId: 'asset-1', status: 'VERIFIED' });
      expect(prismaAsset.update).toHaveBeenCalledWith({ where: { id: 'asset-1' }, data: { status: 'VERIFIED' } });
      expect(scheduleService.schedule).toHaveBeenCalledWith('asset-1', '24h');
    });

    it('HTTP başarılı → AssetVerification.verifiedAt set edilir', async () => {
      prismaAsset.findUnique.mockResolvedValue(assetWithVerification);
      prismaAsset.update.mockResolvedValue({ ...mockAsset, status: 'VERIFIED' });
      mockFetchOk(TOKEN);

      await service.verifyHttp('user-1', 'asset-1', VERIFY_URL);

      expect(prismaAssetVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'v-http-1' },
          data: expect.objectContaining({ verifiedAt: expect.any(Date) }),
        }),
      );
    });

    it('HTTP response 404 → BadRequestException, asset VERIFIED yapılmaz', async () => {
      prismaAsset.findUnique.mockResolvedValue(assetWithVerification);
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 } as any);

      await expect(service.verifyHttp('user-1', 'asset-1', VERIFY_URL)).rejects.toThrow(BadRequestException);
      expect(prismaAsset.update).not.toHaveBeenCalled();
      expect(scheduleService.schedule).not.toHaveBeenCalled();
    });

    it('response body token içermiyorsa → BadRequestException, asset VERIFIED yapılmaz', async () => {
      prismaAsset.findUnique.mockResolvedValue(assetWithVerification);
      mockFetchOk('wrong-content-no-token-here');

      await expect(service.verifyHttp('user-1', 'asset-1', VERIFY_URL)).rejects.toThrow(BadRequestException);
      expect(prismaAsset.update).not.toHaveBeenCalled();
    });

    it('fetch network error → BadRequestException, asset VERIFIED yapılmaz', async () => {
      prismaAsset.findUnique.mockResolvedValue(assetWithVerification);
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.verifyHttp('user-1', 'asset-1', VERIFY_URL)).rejects.toThrow(BadRequestException);
      expect(prismaAsset.update).not.toHaveBeenCalled();
    });

    it('www. prefix ile URL kabul edilir → VERIFIED yapılır', async () => {
      prismaAsset.findUnique.mockResolvedValue(assetWithVerification);
      prismaAsset.update.mockResolvedValue({ ...mockAsset, status: 'VERIFIED' });
      mockFetchOk(TOKEN);

      const result = await service.verifyHttp(
        'user-1', 'asset-1',
        'https://www.example.com/.well-known/asm-verify.txt',
      );

      expect(result.status).toBe('VERIFIED');
    });
  });

  // ─── verifyDns ───────────────────────────────────────────────────────────────

  describe('verifyDns', () => {
    const TOKEN = 'deadbeef1234567890abcdef12345678';
    const mockVerification = { id: 'v-dns-1', token: TOKEN };

    beforeEach(() => {
      prismaAsset.findUnique.mockResolvedValue(mockAsset);
      prismaAssetVerification.findFirst.mockResolvedValue(mockVerification);
      prismaAsset.update.mockResolvedValue({ ...mockAsset, status: 'VERIFIED' });
      (dnsModule.setServers as jest.Mock).mockImplementation(() => {});
    });

    afterEach(() => {
      (dnsModule.resolveTxt as jest.Mock).mockReset();
    });

    it('başka kullanıcının asset\'i → NotFoundException', async () => {
      prismaAsset.findUnique.mockResolvedValue({ ...mockAsset, userId: 'user-2' });

      await expect(service.verifyDns('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('asset bulunamazsa → NotFoundException', async () => {
      prismaAsset.findUnique.mockResolvedValue(null);

      await expect(service.verifyDns('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('IP asset için DNS verification → BadRequestException', async () => {
      prismaAsset.findUnique.mockResolvedValue({ ...mockAsset, type: 'IP', value: '1.2.3.4' });

      await expect(service.verifyDns('user-1', 'asset-1')).rejects.toThrow(BadRequestException);
    });

    it('DNS token yoksa → BadRequestException', async () => {
      prismaAssetVerification.findFirst.mockResolvedValue(null);

      await expect(service.verifyDns('user-1', 'asset-1')).rejects.toThrow(BadRequestException);
    });

    it('TXT kayıtları token içeriyorsa → VERIFIED yapılır, schedule kurulur', async () => {
      (dnsModule.resolveTxt as jest.Mock).mockResolvedValue([[`asm-verify=${TOKEN}`]]);

      const result = await service.verifyDns('user-1', 'asset-1');

      expect(result).toEqual({ ok: true, assetId: 'asset-1', status: 'VERIFIED', method: 'DNS_TXT' });
      expect(prismaAsset.update).toHaveBeenCalledWith({ where: { id: 'asset-1' }, data: { status: 'VERIFIED' } });
      expect(scheduleService.schedule).toHaveBeenCalledWith('asset-1', '24h');
    });

    it('DNS doğrulama başarılı → AssetVerification.verifiedAt set edilir', async () => {
      (dnsModule.resolveTxt as jest.Mock).mockResolvedValue([[`asm-verify=${TOKEN}`]]);

      await service.verifyDns('user-1', 'asset-1');

      expect(prismaAssetVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'v-dns-1' },
          data: expect.objectContaining({ verifiedAt: expect.any(Date) }),
        }),
      );
    });

    it('TXT kayıtları yanlış token içeriyorsa → BadRequestException, asset VERIFIED yapılmaz', async () => {
      (dnsModule.resolveTxt as jest.Mock).mockResolvedValue([['asm-verify=wrong-token']]);

      await expect(service.verifyDns('user-1', 'asset-1')).rejects.toThrow(BadRequestException);
      expect(prismaAsset.update).not.toHaveBeenCalled();
      expect(scheduleService.schedule).not.toHaveBeenCalled();
    });

    it('resolveTxt ENOTFOUND fırlatırsa → BadRequestException, asset VERIFIED yapılmaz', async () => {
      (dnsModule.resolveTxt as jest.Mock).mockRejectedValue(
        Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }),
      );

      await expect(service.verifyDns('user-1', 'asset-1')).rejects.toThrow(BadRequestException);
      expect(prismaAsset.update).not.toHaveBeenCalled();
    });

    it('birden fazla TXT kaydında herhangi biri token içeriyorsa → VERIFIED yapılır', async () => {
      (dnsModule.resolveTxt as jest.Mock).mockResolvedValue([
        ['some-other-record'],
        [`asm-verify=${TOKEN}`],
        ['another-spf-record'],
      ]);

      const result = await service.verifyDns('user-1', 'asset-1');

      expect(result.status).toBe('VERIFIED');
    });

    it('_asm-verify.<domain> FQDN ile resolveTxt sorgulanır', async () => {
      (dnsModule.resolveTxt as jest.Mock).mockResolvedValue([[`asm-verify=${TOKEN}`]]);

      await service.verifyDns('user-1', 'asset-1');

      expect(dnsModule.resolveTxt).toHaveBeenCalledWith('_asm-verify.example.com');
    });

    it('TXT boş dizi dönerse → BadRequestException, asset VERIFIED yapılmaz', async () => {
      (dnsModule.resolveTxt as jest.Mock).mockResolvedValue([]);

      await expect(service.verifyDns('user-1', 'asset-1')).rejects.toThrow(BadRequestException);
      expect(prismaAsset.update).not.toHaveBeenCalled();
    });
  });
});
