import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindingsService } from './findings.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockAsset = { id: 'asset-1' };

const makeFinding = (overrides = {}) => ({
  id: 'finding-1',
  assetId: 'asset-1',
  scanRunId: 'scan-1',
  type: 'PORT_EXPOSED',
  key: 'PORT_EXPOSED:example.com',
  severity: 'HIGH',
  dataJson: {},
  aiScore: 85,
  aiWhyJson: {},
  isNew: true,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  resolvedAt: null,
  ...overrides,
});

describe('FindingsService', () => {
  let service: FindingsService;
  let prismaAsset: { findFirst: jest.Mock };
  let prismaFinding: {
    findMany: jest.Mock;
    count: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    prismaAsset = { findFirst: jest.fn() };
    prismaFinding = {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FindingsService,
        { provide: PrismaService, useValue: { asset: prismaAsset, finding: prismaFinding } },
      ],
    }).compile();

    service = module.get<FindingsService>(FindingsService);
  });

  // ─── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('assetId verilmezse → BadRequestException', async () => {
      await expect(service.list('user-1', '')).rejects.toThrow(BadRequestException);
    });

    it('asset bulunamazsa → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);

      await expect(service.list('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('filtre yok → { items, total, page, limit } döner', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaFinding.findMany.mockResolvedValue([makeFinding()]);
      prismaFinding.count.mockResolvedValue(1);

      const result = await service.list('user-1', 'asset-1');

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('severity filtresi geçersizse → BadRequestException', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);

      await expect(service.list('user-1', 'asset-1', { severity: 'INVALID' })).rejects.toThrow(BadRequestException);
    });

    it('severity=HIGH → where.severity HIGH olarak set edilir', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaFinding.findMany.mockResolvedValue([]);
      prismaFinding.count.mockResolvedValue(0);

      await service.list('user-1', 'asset-1', { severity: 'high' });

      const whereArg = prismaFinding.findMany.mock.calls[0][0].where;
      expect(whereArg.severity).toBe('HIGH');
    });

    it('resolved=false → resolvedAt: null filtresi uygulanır', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaFinding.findMany.mockResolvedValue([]);
      prismaFinding.count.mockResolvedValue(0);

      await service.list('user-1', 'asset-1', { resolved: 'false' });

      const whereArg = prismaFinding.findMany.mock.calls[0][0].where;
      expect(whereArg.resolvedAt).toBeNull();
    });

    it('resolved=true → resolvedAt: { not: null } filtresi uygulanır', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaFinding.findMany.mockResolvedValue([]);
      prismaFinding.count.mockResolvedValue(0);

      await service.list('user-1', 'asset-1', { resolved: 'true' });

      const whereArg = prismaFinding.findMany.mock.calls[0][0].where;
      expect(whereArg.resolvedAt).toEqual({ not: null });
    });

    it('isNew=true → where.isNew: true', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaFinding.findMany.mockResolvedValue([]);
      prismaFinding.count.mockResolvedValue(0);

      await service.list('user-1', 'asset-1', { isNew: 'true' });

      const whereArg = prismaFinding.findMany.mock.calls[0][0].where;
      expect(whereArg.isNew).toBe(true);
    });

    it('pagination → skip ve take doğru hesaplanır', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaFinding.findMany.mockResolvedValue([]);
      prismaFinding.count.mockResolvedValue(0);

      await service.list('user-1', 'asset-1', { page: 3, limit: 10 });

      const queryArg = prismaFinding.findMany.mock.calls[0][0];
      expect(queryArg.skip).toBe(20);
      expect(queryArg.take).toBe(10);
    });

    it('limit 100\'den büyük verilemez → 100\'e sabitlenir', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAsset);
      prismaFinding.findMany.mockResolvedValue([]);
      prismaFinding.count.mockResolvedValue(0);

      await service.list('user-1', 'asset-1', { limit: 999 });

      const queryArg = prismaFinding.findMany.mock.calls[0][0];
      expect(queryArg.take).toBe(100);
    });
  });

  // ─── ack ─────────────────────────────────────────────────────────────────────

  describe('ack', () => {
    it('finding acknowledge edilir → isNew false olur', async () => {
      const finding = makeFinding({ asset: { userId: 'user-1' } });
      prismaFinding.findFirst.mockResolvedValue(finding);
      prismaFinding.update.mockResolvedValue({ ...finding, isNew: false });

      const result = await service.ack('user-1', 'finding-1') as { isNew: boolean };

      expect(result.isNew).toBe(false);
      expect(prismaFinding.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isNew: false }) }),
      );
    });

    it('finding bulunamazsa → NotFoundException', async () => {
      prismaFinding.findFirst.mockResolvedValue(null);

      await expect(service.ack('user-1', 'finding-1')).rejects.toThrow(NotFoundException);
    });

    it('başka kullanıcının finding\'i → NotFoundException', async () => {
      prismaFinding.findFirst.mockResolvedValue(
        makeFinding({ asset: { userId: 'other-user' } }),
      );

      await expect(service.ack('user-1', 'finding-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── resolve ──────────────────────────────────────────────────────────────────

  describe('resolve', () => {
    it('finding manuel resolve edilir → resolvedAt set, isNew false', async () => {
      prismaFinding.findFirst.mockResolvedValue(makeFinding({ asset: { userId: 'user-1' } }));
      prismaFinding.update.mockResolvedValue({});

      await service.resolve('user-1', 'finding-1');

      const arg = prismaFinding.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'finding-1' });
      expect(arg.data.resolvedAt).toBeInstanceOf(Date);
      expect(arg.data.isNew).toBe(false);
    });

    it('finding bulunamazsa → NotFoundException, update çağrılmaz', async () => {
      prismaFinding.findFirst.mockResolvedValue(null);
      await expect(service.resolve('user-1', 'finding-1')).rejects.toThrow(NotFoundException);
      expect(prismaFinding.update).not.toHaveBeenCalled();
    });

    it('başka kullanıcının finding\'i → NotFoundException', async () => {
      prismaFinding.findFirst.mockResolvedValue(makeFinding({ asset: { userId: 'other-user' } }));
      await expect(service.resolve('user-1', 'finding-1')).rejects.toThrow(NotFoundException);
    });

    it('id boşsa → BadRequestException', async () => {
      await expect(service.resolve('user-1', '')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── reopen ───────────────────────────────────────────────────────────────────

  describe('reopen', () => {
    it('finding reopen edilir → resolvedAt null', async () => {
      prismaFinding.findFirst.mockResolvedValue(makeFinding({ asset: { userId: 'user-1' } }));
      prismaFinding.update.mockResolvedValue({});

      await service.reopen('user-1', 'finding-1');

      const arg = prismaFinding.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'finding-1' });
      expect(arg.data.resolvedAt).toBeNull();
    });

    it('başka kullanıcının finding\'i → NotFoundException', async () => {
      prismaFinding.findFirst.mockResolvedValue(makeFinding({ asset: { userId: 'other-user' } }));
      await expect(service.reopen('user-1', 'finding-1')).rejects.toThrow(NotFoundException);
    });
  });
});
