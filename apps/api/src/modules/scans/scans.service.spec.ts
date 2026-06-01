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
  let prismaScanRun: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; count: jest.Mock };
  let prismaScanCheckResult: { findMany: jest.Mock };
  let queueAdd: jest.Mock;

  beforeEach(async () => {
    prismaAsset = { findFirst: jest.fn() };
    prismaScanRun = { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), count: jest.fn() };
    prismaScanCheckResult = { findMany: jest.fn() };
    queueAdd = jest.fn().mockResolvedValue({ id: 'job-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScansService,
        { provide: PrismaService, useValue: { asset: prismaAsset, scanRun: prismaScanRun, scanCheckResult: prismaScanCheckResult } },
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
        { id: 'run-1', assetId: 'asset-1', startedAt: new Date(), finishedAt: new Date(), status: 'DONE', findingsCount: 3 },
      ]);
      prismaScanRun.count.mockResolvedValue(1);

      const result = await service.history('user-1', 'asset-1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].findingsCount).toBe(3);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });
  });

  // ─── checks ──────────────────────────────────────────────────────────────────

  describe('checks', () => {
    it('scanRunId verilmezse → BadRequestException', async () => {
      await expect(service.checks('user-1', '')).rejects.toThrow(BadRequestException);
    });

    it('tarama bulunamazsa/başkasına aitse → NotFoundException', async () => {
      prismaScanRun.findFirst.mockResolvedValue(null);
      await expect(service.checks('user-1', 'run-1')).rejects.toThrow(NotFoundException);
      expect(prismaScanCheckResult.findMany).not.toHaveBeenCalled();
    });

    it('başarılı → o taramanın tüm check snapshot\'ları döner', async () => {
      prismaScanRun.findFirst.mockResolvedValue({ id: 'run-1', status: 'DONE', startedAt: new Date(), finishedAt: new Date() });
      prismaScanCheckResult.findMany.mockResolvedValue([
        { id: 'c1', type: 'PORTS', dataJson: { openPorts: [22] }, createdAt: new Date() },
        { id: 'c2', type: 'TLS_INFO', dataJson: { ok: true }, createdAt: new Date() },
      ]);

      const result = await service.checks('user-1', 'run-1');

      expect(result.scanRunId).toBe('run-1');
      expect(result.items).toHaveLength(2);
      expect(result.items.map(i => i.type)).toEqual(['PORTS', 'TLS_INFO']);
      // ownership scanRun.findFirst asset.userId ile sorgulanır
      expect(prismaScanRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'run-1', asset: { userId: 'user-1' } } }),
      );
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
