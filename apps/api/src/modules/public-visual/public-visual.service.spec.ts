// PublicVisualAnalysisService unit testleri.
//
// PrismaService ve BullMQ Queue mock'lanır. SSRF guard'ın kendisi ayrı
// ssrf-guard.spec.ts'te detaylı test ediliyor; burada yalnızca controller
// service entegrasyonu (queue enqueue, list/getOne/getScreenshot ownership)
// kontrol edilir.

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PublicVisualAnalysisService } from './public-visual.service';

// SSRF lookup helper'ın doğrudan testten geçmesini engellemek için dns.lookup
// global olarak mock'lanmıyor; bunun yerine valid bir URL+IP kullanıyoruz ve
// service create() içinde SSRF guard public IP kabul ediyor. Test için
// `https://1.1.1.1` literal IP veriyoruz — DNS lookup hiç yapılmaz.

function makePrismaMock() {
  return {
    publicVisualAnalysisRun: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function makeQueueMock() {
  return { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
}

describe('PublicVisualAnalysisService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let queue: ReturnType<typeof makeQueueMock>;
  let service: PublicVisualAnalysisService;

  beforeEach(() => {
    prisma = makePrismaMock();
    queue = makeQueueMock();
    service = new PublicVisualAnalysisService(prisma as never, queue as never);
  });

  describe('create', () => {
    it('valid public IP literal → row create + queue enqueue', async () => {
      prisma.publicVisualAnalysisRun.create.mockResolvedValue({
        id: 'run-1',
        userId: 'u1',
        url: 'https://1.1.1.1/',
        finalUrl: null,
        statusCode: null,
        status: 'RUNNING',
        screenshotPath: null,
        screenshotHash: null,
        screenshotWidth: null,
        screenshotHeight: null,
        title: null,
        metaDescription: null,
        h1TextsJson: null,
        visibleText: null,
        visibleTextHash: null,
        ruleSiteCategory: null,
        rulePurposeSummary: null,
        ruleLanguage: null,
        ruleSignalsJson: null,
        ruleRiskLevel: null,
        aiVisualAnalysisJson: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        finishedAt: null,
      });

      const r = await service.create({ userId: 'u1', url: 'https://1.1.1.1/' });
      expect(r.id).toBe('run-1');
      expect(r.status).toBe('RUNNING');
      expect(r.screenshotUrl).toBeNull();
      expect(prisma.publicVisualAnalysisRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'u1', url: 'https://1.1.1.1/', status: 'RUNNING' }),
      });
      expect(queue.add).toHaveBeenCalledWith(
        'visual.public.analyze',
        { runId: 'run-1', url: 'https://1.1.1.1/' },
        expect.objectContaining({ jobId: expect.stringContaining('run-1') }),
      );
    });

    it('SSRF reject → BadRequestException + ssrf kod, prisma/queue çağrılmaz', async () => {
      await expect(service.create({ userId: 'u1', url: 'http://localhost' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.publicVisualAnalysisRun.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('private IP literal → BadRequest, prisma/queue çağrılmaz', async () => {
      await expect(service.create({ userId: 'u1', url: 'http://10.0.0.5' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.publicVisualAnalysisRun.create).not.toHaveBeenCalled();
    });

    it('ftp şeması → BadRequest', async () => {
      await expect(service.create({ userId: 'u1', url: 'ftp://example.com' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('BadRequest body kod taşır', async () => {
      try {
        await service.create({ userId: 'u1', url: 'http://localhost' });
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const body = (err as BadRequestException).getResponse() as { code: string };
        expect(body.code).toBe('HOSTNAME_BLOCKED');
      }
    });
  });

  describe('list', () => {
    it('userId ile filtreler, default 20 limit', async () => {
      prisma.publicVisualAnalysisRun.findMany.mockResolvedValue([]);
      await service.list('u1');
      expect(prisma.publicVisualAnalysisRun.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    });

    it('limit 100 verilirse 50\'ye clamp', async () => {
      prisma.publicVisualAnalysisRun.findMany.mockResolvedValue([]);
      await service.list('u1', 100);
      expect(prisma.publicVisualAnalysisRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('limit 0 verilirse 1\'e clamp', async () => {
      prisma.publicVisualAnalysisRun.findMany.mockResolvedValue([]);
      await service.list('u1', 0);
      expect(prisma.publicVisualAnalysisRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });
  });

  describe('getOne', () => {
    it('userId+runId match yoksa NotFound', async () => {
      prisma.publicVisualAnalysisRun.findFirst.mockResolvedValue(null);
      await expect(service.getOne('u1', 'unknown')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('match varsa detail döner, ai yoksa hasAi=false', async () => {
      prisma.publicVisualAnalysisRun.findFirst.mockResolvedValue({
        id: 'run-1', userId: 'u1', url: 'https://x', finalUrl: null, statusCode: null,
        status: 'DONE', screenshotPath: null, screenshotHash: null, screenshotWidth: null,
        screenshotHeight: null, title: 'X', metaDescription: null, h1TextsJson: ['H'],
        visibleText: 'v', visibleTextHash: null, ruleSiteCategory: 'corporate',
        rulePurposeSummary: 'p', ruleLanguage: 'tr', ruleSignalsJson: ['LOGIN_PANEL_VISIBLE'],
        ruleRiskLevel: 'LOW', aiVisualAnalysisJson: null, error: null,
        createdAt: new Date(), updatedAt: new Date(), finishedAt: null,
      });

      const r = await service.getOne('u1', 'run-1');
      expect(r.title).toBe('X');
      expect(r.h1Texts).toEqual(['H']);
      expect(r.ruleSignals).toEqual(['LOGIN_PANEL_VISIBLE']);
      expect(r.hasAi).toBe(false);
      expect(r.aiVisualAnalysis).toBeNull();
    });

    it('aiVisualAnalysisJson varsa hasAi=true ve veri döner', async () => {
      const aiJson = { sitePurpose: 'tanıtım' };
      prisma.publicVisualAnalysisRun.findFirst.mockResolvedValue({
        id: 'run-1', userId: 'u1', url: 'https://x', finalUrl: null, statusCode: null,
        status: 'DONE', screenshotPath: null, screenshotHash: null, screenshotWidth: null,
        screenshotHeight: null, title: null, metaDescription: null, h1TextsJson: null,
        visibleText: null, visibleTextHash: null, ruleSiteCategory: null,
        rulePurposeSummary: null, ruleLanguage: null, ruleSignalsJson: null,
        ruleRiskLevel: null, aiVisualAnalysisJson: aiJson, error: null,
        createdAt: new Date(), updatedAt: new Date(), finishedAt: null,
      });

      const r = await service.getOne('u1', 'run-1');
      expect(r.hasAi).toBe(true);
      expect(r.aiVisualAnalysis).toEqual(aiJson);
    });
  });

  describe('getScreenshot', () => {
    it('run yoksa NotFound', async () => {
      prisma.publicVisualAnalysisRun.findFirst.mockResolvedValue(null);
      await expect(service.getScreenshot('u1', 'unknown')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('screenshotPath null ise NotFound', async () => {
      prisma.publicVisualAnalysisRun.findFirst.mockResolvedValue({
        id: 'run-1', userId: 'u1', screenshotPath: null,
      });
      await expect(service.getScreenshot('u1', 'run-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('izin verilen kök dışındaki path → Forbidden', async () => {
      process.env.VISUAL_SCREENSHOT_DIR = '/tmp/asm-allowed';
      prisma.publicVisualAnalysisRun.findFirst.mockResolvedValue({
        id: 'run-1', userId: 'u1', screenshotPath: '/etc/passwd',
      });
      await expect(service.getScreenshot('u1', 'run-1')).rejects.toBeInstanceOf(ForbiddenException);
      delete process.env.VISUAL_SCREENSHOT_DIR;
    });
  });
});
