import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ScansService } from './scans.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_SCAN } from '../queue/queue.constants';

const mockAssetVerified = { id: 'asset-1', status: 'VERIFIED', type: 'DOMAIN', value: 'example.com' };
const mockAssetPending = { id: 'asset-2', status: 'PENDING', type: 'DOMAIN', value: 'example.com' };
const mockScanRun = { id: 'run-1', startedAt: new Date(), status: 'RUNNING' };

describe('ScansService', () => {
  let service: ScansService;
  let prismaAsset: { findFirst: jest.Mock };
  let prismaScanRun: { findMany: jest.Mock; create: jest.Mock };
  let queueAdd: jest.Mock;

  beforeEach(async () => {
    prismaAsset = { findFirst: jest.fn() };
    prismaScanRun = { findMany: jest.fn(), create: jest.fn() };
    queueAdd = jest.fn().mockResolvedValue({ id: 'job-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScansService,
        { provide: PrismaService, useValue: { asset: prismaAsset, scanRun: prismaScanRun } },
        { provide: getQueueToken(QUEUE_SCAN), useValue: { add: queueAdd } },
      ],
    }).compile();

    service = module.get<ScansService>(ScansService);
  });

  // ─── history ─────────────────────────────────────────────────────────────────

  describe('history', () => {
    it('assetId verilmezse → BadRequestException', async () => {
      await expect(service.history('user-1', '')).rejects.toThrow(BadRequestException);
    });

    it('asset bulunamazsa → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);

      await expect(service.history('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('başarılı → scan run listesi döner', async () => {
      prismaAsset.findFirst.mockResolvedValue({ id: 'asset-1' });
      prismaScanRun.findMany.mockResolvedValue([
        { id: 'run-1', assetId: 'asset-1', startedAt: new Date(), finishedAt: new Date(), status: 'DONE', _count: { findings: 3 } },
      ]);

      const result = await service.history('user-1', 'asset-1');

      expect(result).toHaveLength(1);
      expect(result[0]._count.findings).toBe(3);
    });
  });

  // ─── runNow ──────────────────────────────────────────────────────────────────

  describe('runNow', () => {
    it('assetId verilmezse → BadRequestException', async () => {
      await expect(service.runNow('user-1', '')).rejects.toThrow(BadRequestException);
    });

    it('asset bulunamazsa → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);

      await expect(service.runNow('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('asset PENDING ise → ForbiddenException', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAssetPending);

      await expect(service.runNow('user-1', 'asset-2')).rejects.toThrow(ForbiddenException);
      expect(queueAdd).not.toHaveBeenCalled();
    });

    it('VERIFIED asset → scanRun oluşturulur ve queue\'a eklenir', async () => {
      prismaAsset.findFirst.mockResolvedValue(mockAssetVerified);
      prismaScanRun.create.mockResolvedValue(mockScanRun);

      const result = await service.runNow('user-1', 'asset-1');

      expect(result.ok).toBe(true);
      expect(result.scanRunId).toBe('run-1');
      expect(result.status).toBe('QUEUED');
      expect(queueAdd).toHaveBeenCalledWith(
        'scan.run',
        { scanRunId: 'run-1', assetId: 'asset-1' },
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });
});
