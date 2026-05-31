import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Allowed root for screenshot serving. Worker tarafındaki default ile aynı —
// VISUAL_SCREENSHOT_DIR env'i ortak kullanılırsa hem worker yazar hem API okur.
function resolveAllowedRoot(): string {
  const envRoot = process.env.VISUAL_SCREENSHOT_DIR;
  const base = envRoot && envRoot.trim().length > 0
    ? envRoot
    : path.join(os.tmpdir(), 'asm-visual-screenshots');
  return path.resolve(base);
}

// Portable response shape — TS2742'yi engellemek için (sqli-targets pattern'iyle aynı).
// paramsJson/signalsJson/analysisJson Prisma'da JsonValue, portable değil → unknown.
export interface VisualAnalysisListItem {
  id: string;
  assetId: string;
  url: string;
  finalUrl: string | null;
  statusCode: number | null;
  screenshotUrl: string | null;     // /assets/:assetId/visual-analysis/:id/screenshot
  title: string | null;
  metaDescription: string | null;
  h1Texts: string[];
  siteCategory: string | null;
  purposeSummary: string | null;
  language: string | null;
  signals: string[];
  riskLevel: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisualAnalysisDetail extends VisualAnalysisListItem {
  visibleText: string | null;
  visibleTextHash: string | null;
  screenshotHash: string | null;
  screenshotWidth: number | null;
  screenshotHeight: number | null;
  analysis: unknown;                // analysisJson opaque
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface RawVisualRun {
  id: string;
  assetId: string;
  url: string;
  finalUrl: string | null;
  statusCode: number | null;
  screenshotPath: string | null;
  screenshotHash: string | null;
  screenshotWidth: number | null;
  screenshotHeight: number | null;
  title: string | null;
  metaDescription: string | null;
  h1TextsJson: unknown;
  visibleText: string | null;
  visibleTextHash: string | null;
  siteCategory: string | null;
  purposeSummary: string | null;
  language: string | null;
  signalsJson: unknown;
  analysisJson: unknown;
  riskLevel: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

function buildScreenshotUrl(assetId: string, runId: string, hasFile: boolean): string | null {
  if (!hasFile) return null;
  return `/assets/${assetId}/visual-analysis/${runId}/screenshot`;
}

function toListItem(raw: RawVisualRun): VisualAnalysisListItem {
  return {
    id: raw.id,
    assetId: raw.assetId,
    url: raw.url,
    finalUrl: raw.finalUrl,
    statusCode: raw.statusCode,
    screenshotUrl: buildScreenshotUrl(raw.assetId, raw.id, !!raw.screenshotPath),
    title: raw.title,
    metaDescription: raw.metaDescription,
    h1Texts: parseStringArray(raw.h1TextsJson),
    siteCategory: raw.siteCategory,
    purposeSummary: raw.purposeSummary,
    language: raw.language,
    signals: parseStringArray(raw.signalsJson),
    riskLevel: raw.riskLevel,
    error: raw.error,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function toDetail(raw: RawVisualRun): VisualAnalysisDetail {
  return {
    ...toListItem(raw),
    visibleText: raw.visibleText,
    visibleTextHash: raw.visibleTextHash,
    screenshotHash: raw.screenshotHash,
    screenshotWidth: raw.screenshotWidth,
    screenshotHeight: raw.screenshotHeight,
    analysis: raw.analysisJson ?? null,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class VisualAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, assetId: string, limit = 10): Promise<VisualAnalysisListItem[]> {
    await this.ensureAssetOwnership(userId, assetId);

    const safeLimit = Math.min(Math.max(1, limit), 50);
    const runs = (await this.prisma.visualAnalysisRun.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    })) as unknown as RawVisualRun[];

    return runs.map(toListItem);
  }

  async getOne(userId: string, assetId: string, runId: string): Promise<VisualAnalysisDetail> {
    await this.ensureAssetOwnership(userId, assetId);

    const run = (await this.prisma.visualAnalysisRun.findFirst({
      where: { id: runId, assetId },
    })) as unknown as RawVisualRun | null;

    if (!run) {
      throw new NotFoundException('Visual analysis not found');
    }
    return toDetail(run);
  }

  // Screenshot dosyasını StreamableFile olarak döner. Path traversal koruması:
  // path.resolve ile normalize edilir; sonuç allowedRoot prefix'inde değilse
  // 403 Forbidden. Dosya yoksa 404 (path leak engellemek için generic mesaj).
  async getScreenshot(userId: string, assetId: string, runId: string): Promise<StreamableFile> {
    await this.ensureAssetOwnership(userId, assetId);

    const run = (await this.prisma.visualAnalysisRun.findFirst({
      where: { id: runId, assetId },
      select: { id: true, assetId: true, screenshotPath: true },
    })) as { id: string; assetId: string; screenshotPath: string | null } | null;

    if (!run) {
      throw new NotFoundException('Visual analysis not found');
    }
    if (!run.screenshotPath) {
      throw new NotFoundException('Screenshot not available');
    }

    // Path traversal koruması
    const allowedRoot = resolveAllowedRoot();
    const resolved = path.resolve(run.screenshotPath);
    const prefixWithSep = allowedRoot.endsWith(path.sep) ? allowedRoot : allowedRoot + path.sep;
    if (resolved !== allowedRoot && !resolved.startsWith(prefixWithSep)) {
      // DB'de manipüle edilmiş path bile burada durur
      throw new ForbiddenException('Screenshot path not allowed');
    }

    // Dosya gerçekten var mı?
    try {
      await fsp.access(resolved, fs.constants.R_OK);
    } catch {
      throw new NotFoundException('Screenshot not available');
    }

    const stream = fs.createReadStream(resolved);
    return new StreamableFile(stream, { type: 'image/png' });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async ensureAssetOwnership(userId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId },
      select: { id: true },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
  }
}
