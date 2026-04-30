import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScanScheduleService } from '../modules/scans/scan-schedule.service';

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
  let prismaAssetVerification: { create: jest.Mock; deleteMany: jest.Mock };
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
    };
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
  });
});
