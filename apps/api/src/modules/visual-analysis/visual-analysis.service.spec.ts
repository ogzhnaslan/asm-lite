import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, StreamableFile } from '@nestjs/common';
import { VisualAnalysisService } from './visual-analysis.service';
import { PrismaService } from '../../prisma/prisma.service';

// fs/promises.access ve fs.createReadStream'i mock'lıyoruz — gerçek dosya yok.
jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
}));
jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs');
  return {
    ...actual,
    createReadStream: jest.fn(),
  };
});

// Test'lerin deterministik olması için VISUAL_SCREENSHOT_DIR'i sabit bir yola ayarla.
const TEST_ROOT = path.resolve(path.join(os.tmpdir(), 'asm-visual-test-root'));

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    assetId: 'asset-1',
    url: 'https://example.com',
    finalUrl: 'https://example.com/',
    statusCode: 200,
    screenshotPath: path.join(TEST_ROOT, 'visual_example.com_1.png'),
    screenshotHash: 'a'.repeat(64),
    screenshotWidth: 1440,
    screenshotHeight: 900,
    title: 'Example',
    metaDescription: null,
    h1TextsJson: ['Welcome'],
    visibleText: 'short body',
    visibleTextHash: 'b'.repeat(64),
    siteCategory: 'corporate',
    purposeSummary: 'Test özet',
    language: 'tr',
    signalsJson: ['ADMIN_PANEL_VISIBLE'],
    analysisJson: { hasAdminHints: true, detectedKeywords: ['admin'] },
    riskLevel: 'MEDIUM',
    error: null,
    createdAt: new Date('2026-05-25T13:00:00.000Z'),
    updatedAt: new Date('2026-05-25T13:00:00.000Z'),
    ...overrides,
  };
}

describe('VisualAnalysisService', () => {
  let service: VisualAnalysisService;
  let prismaAsset: { findFirst: jest.Mock };
  let prismaVisual: { findMany: jest.Mock; findFirst: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.VISUAL_SCREENSHOT_DIR = TEST_ROOT;

    prismaAsset = { findFirst: jest.fn() };
    prismaVisual = { findMany: jest.fn(), findFirst: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisualAnalysisService,
        {
          provide: PrismaService,
          useValue: { asset: prismaAsset, visualAnalysisRun: prismaVisual },
        },
      ],
    }).compile();

    service = module.get<VisualAnalysisService>(VisualAnalysisService);
  });

  afterEach(() => {
    delete process.env.VISUAL_SCREENSHOT_DIR;
  });

  // ─── Ownership / not found ────────────────────────────────────────────────

  describe('ownership & not-found', () => {
    it('asset bulunamazsa list → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);
      await expect(service.list('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('başka user asset\'i (findFirst null) → list NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);  // userId filter mismatch
      await expect(service.list('user-1', 'asset-other')).rejects.toThrow(NotFoundException);
    });

    it('asset bulunamazsa getOne → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);
      await expect(service.getOne('user-1', 'asset-1', 'run-1')).rejects.toThrow(NotFoundException);
    });

    it('asset bulunamazsa getScreenshot → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);
      await expect(service.getScreenshot('user-1', 'asset-1', 'run-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── list ────────────────────────────────────────────────────────────────

  describe('list', () => {
    beforeEach(() => prismaAsset.findFirst.mockResolvedValue({ id: 'asset-1' }));

    it('en yeni analizler önce, takvim sırasına göre', async () => {
      prismaVisual.findMany.mockResolvedValue([makeRun({ id: 'r-1' }), makeRun({ id: 'r-2' })]);
      const result = await service.list('user-1', 'asset-1');
      expect(result).toHaveLength(2);
      expect(prismaVisual.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { assetId: 'asset-1' },
        orderBy: { createdAt: 'desc' },
      }));
    });

    it('h1Texts ve signals string array olarak döner', async () => {
      prismaVisual.findMany.mockResolvedValue([makeRun()]);
      const result = await service.list('user-1', 'asset-1');
      expect(result[0].h1Texts).toEqual(['Welcome']);
      expect(result[0].signals).toEqual(['ADMIN_PANEL_VISIBLE']);
    });

    it('screenshotUrl üretilir (raw screenshotPath response\'ta YOK)', async () => {
      prismaVisual.findMany.mockResolvedValue([makeRun({ id: 'r-1' })]);
      const result = await service.list('user-1', 'asset-1');
      expect(result[0].screenshotUrl).toBe('/assets/asset-1/visual-analysis/r-1/screenshot');
      expect(result[0]).not.toHaveProperty('screenshotPath');
    });

    it('screenshotPath null ise screenshotUrl null', async () => {
      prismaVisual.findMany.mockResolvedValue([makeRun({ screenshotPath: null })]);
      const result = await service.list('user-1', 'asset-1');
      expect(result[0].screenshotUrl).toBeNull();
    });

    it('limit clamp: 51 → 50', async () => {
      prismaVisual.findMany.mockResolvedValue([]);
      await service.list('user-1', 'asset-1', 51);
      expect(prismaVisual.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });

    it('limit clamp: -5 → 1 (alt sınır)', async () => {
      prismaVisual.findMany.mockResolvedValue([]);
      await service.list('user-1', 'asset-1', -5);
      expect(prismaVisual.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
    });

    it('limit verilmezse default 10', async () => {
      prismaVisual.findMany.mockResolvedValue([]);
      await service.list('user-1', 'asset-1');
      expect(prismaVisual.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    });

    it('h1TextsJson array değilse boş dizi döner (defansif)', async () => {
      prismaVisual.findMany.mockResolvedValue([makeRun({ h1TextsJson: 'bozuk-değer' })]);
      const result = await service.list('user-1', 'asset-1');
      expect(result[0].h1Texts).toEqual([]);
    });
  });

  // ─── getOne ──────────────────────────────────────────────────────────────

  describe('getOne', () => {
    beforeEach(() => prismaAsset.findFirst.mockResolvedValue({ id: 'asset-1' }));

    it('mevcut run detay döner (visibleText + analysisJson dahil)', async () => {
      prismaVisual.findFirst.mockResolvedValue(makeRun());
      const result = await service.getOne('user-1', 'asset-1', 'run-1');
      expect(result.id).toBe('run-1');
      expect(result.visibleText).toBe('short body');
      expect(result.analysis).toEqual({ hasAdminHints: true, detectedKeywords: ['admin'] });
    });

    it('run başka asset\'e aitse → NotFoundException (cross-asset koruma)', async () => {
      prismaVisual.findFirst.mockResolvedValue(null);  // assetId filter mismatch
      await expect(service.getOne('user-1', 'asset-1', 'run-other'))
        .rejects.toThrow(/Visual analysis not found/);
    });

    it('findFirst where filter: id + assetId çiftli', async () => {
      prismaVisual.findFirst.mockResolvedValue(makeRun());
      await service.getOne('user-1', 'asset-1', 'run-1');
      expect(prismaVisual.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'run-1', assetId: 'asset-1' },
      }));
    });
  });

  // ─── getScreenshot ───────────────────────────────────────────────────────

  describe('getScreenshot', () => {
    beforeEach(() => prismaAsset.findFirst.mockResolvedValue({ id: 'asset-1' }));

    it('run yoksa → NotFoundException', async () => {
      prismaVisual.findFirst.mockResolvedValue(null);
      await expect(service.getScreenshot('user-1', 'asset-1', 'run-1'))
        .rejects.toThrow(/Visual analysis not found/);
    });

    it('screenshotPath null ise → NotFoundException (Screenshot not available)', async () => {
      prismaVisual.findFirst.mockResolvedValue({ id: 'run-1', assetId: 'asset-1', screenshotPath: null });
      await expect(service.getScreenshot('user-1', 'asset-1', 'run-1'))
        .rejects.toThrow(/Screenshot not available/);
    });

    it('path allowedRoot dışında ise → ForbiddenException (path traversal koruması)', async () => {
      prismaVisual.findFirst.mockResolvedValue({
        id: 'run-1', assetId: 'asset-1',
        screenshotPath: '/etc/passwd',  // allowedRoot dışı
      });
      await expect(service.getScreenshot('user-1', 'asset-1', 'run-1'))
        .rejects.toThrow(ForbiddenException);
    });

    it('".." içeren path resolve sonrası allowedRoot dışına çıkıyorsa → ForbiddenException', async () => {
      prismaVisual.findFirst.mockResolvedValue({
        id: 'run-1', assetId: 'asset-1',
        screenshotPath: path.join(TEST_ROOT, '..', '..', 'etc', 'passwd'),
      });
      await expect(service.getScreenshot('user-1', 'asset-1', 'run-1'))
        .rejects.toThrow(ForbiddenException);
    });

    it('dosya yoksa → NotFoundException (path leak yok)', async () => {
      prismaVisual.findFirst.mockResolvedValue({
        id: 'run-1', assetId: 'asset-1',
        screenshotPath: path.join(TEST_ROOT, 'missing.png'),
      });
      (fsp.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(service.getScreenshot('user-1', 'asset-1', 'run-1'))
        .rejects.toThrow(/Screenshot not available/);
    });

    it('dosya var ve allowedRoot içinde → StreamableFile image/png döner', async () => {
      prismaVisual.findFirst.mockResolvedValue({
        id: 'run-1', assetId: 'asset-1',
        screenshotPath: path.join(TEST_ROOT, 'visual_example.com_1.png'),
      });
      (fsp.access as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as unknown as jest.Mock).mockReturnValue({ pipe: jest.fn() });

      const result = await service.getScreenshot('user-1', 'asset-1', 'run-1');
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('run başka asset\'e aitse (findFirst null) → NotFoundException', async () => {
      prismaVisual.findFirst.mockResolvedValue(null);
      await expect(service.getScreenshot('user-1', 'asset-1', 'run-other'))
        .rejects.toThrow(/Visual analysis not found/);
    });
  });
});
