// Public visual analysis service.
//
// API tarafında yalnızca:
//   1. SSRF guard → URL normalize ve hostname/IP kontrolü
//   2. DB row insert (status='RUNNING')
//   3. BullMQ job enqueue (visual.public.analyze)
//   4. Polling endpoint için run read + screenshot stream
// yapılır. Asıl Playwright + AI orchestration worker'da (run-public-visual.ts).

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  QUEUE_SCAN,
  JOB_VISUAL_PUBLIC_ANALYZE,
  JOB_ID_VISUAL_PUBLIC_PREFIX,
} from '../queue/queue.constants';
import { normalizePublicUrl, SsrfRejection } from './ssrf-guard';

function resolveAllowedRoot(): string {
  const envRoot = process.env.VISUAL_SCREENSHOT_DIR;
  const base = envRoot && envRoot.trim().length > 0
    ? envRoot
    : path.join(os.tmpdir(), 'asm-visual-screenshots');
  return path.resolve(base);
}

export interface CreatePublicVisualAnalysisInput {
  userId: string;
  url: string;
}

export interface PublicVisualAnalysisListItem {
  id: string;
  url: string;
  finalUrl: string | null;
  statusCode: number | null;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  title: string | null;
  screenshotUrl: string | null;
  ruleSiteCategory: string | null;
  rulePurposeSummary: string | null;
  ruleRiskLevel: string | null;
  hasAi: boolean;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface PublicVisualAnalysisDetail extends PublicVisualAnalysisListItem {
  metaDescription: string | null;
  h1Texts: string[];
  visibleText: string | null;
  ruleSignals: string[];
  ruleLanguage: string | null;
  // aiVisualAnalysisJson tüm AI çıktısı — frontend tipi bunu opaque alır
  aiVisualAnalysis: unknown;
}

interface RawRun {
  id: string;
  userId: string;
  url: string;
  finalUrl: string | null;
  statusCode: number | null;
  status: string;
  screenshotPath: string | null;
  screenshotHash: string | null;
  screenshotWidth: number | null;
  screenshotHeight: number | null;
  title: string | null;
  metaDescription: string | null;
  h1TextsJson: unknown;
  visibleText: string | null;
  visibleTextHash: string | null;
  ruleSiteCategory: string | null;
  rulePurposeSummary: string | null;
  ruleLanguage: string | null;
  ruleSignalsJson: unknown;
  ruleRiskLevel: string | null;
  aiVisualAnalysisJson: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

function normalizeStatus(s: string): 'RUNNING' | 'DONE' | 'FAILED' {
  if (s === 'DONE') return 'DONE';
  if (s === 'FAILED') return 'FAILED';
  return 'RUNNING';
}

function buildScreenshotUrl(runId: string, hasFile: boolean): string | null {
  if (!hasFile) return null;
  return `/visual-analysis/public/${runId}/screenshot`;
}

function toListItem(raw: RawRun): PublicVisualAnalysisListItem {
  return {
    id: raw.id,
    url: raw.url,
    finalUrl: raw.finalUrl,
    statusCode: raw.statusCode,
    status: normalizeStatus(raw.status),
    title: raw.title,
    screenshotUrl: buildScreenshotUrl(raw.id, !!raw.screenshotPath),
    ruleSiteCategory: raw.ruleSiteCategory,
    rulePurposeSummary: raw.rulePurposeSummary,
    ruleRiskLevel: raw.ruleRiskLevel,
    hasAi: raw.aiVisualAnalysisJson !== null && raw.aiVisualAnalysisJson !== undefined,
    error: raw.error,
    createdAt: raw.createdAt,
    finishedAt: raw.finishedAt,
  };
}

function toDetail(raw: RawRun): PublicVisualAnalysisDetail {
  return {
    ...toListItem(raw),
    metaDescription: raw.metaDescription,
    h1Texts: parseStringArray(raw.h1TextsJson),
    visibleText: raw.visibleText,
    ruleSignals: parseStringArray(raw.ruleSignalsJson),
    ruleLanguage: raw.ruleLanguage,
    aiVisualAnalysis: raw.aiVisualAnalysisJson ?? null,
  };
}

@Injectable()
export class PublicVisualAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_SCAN) private readonly scanQueue: Queue,
  ) {}

  // POST /visual-analysis/public
  async create(input: CreatePublicVisualAnalysisInput): Promise<PublicVisualAnalysisListItem> {
    let normalized;
    try {
      normalized = await normalizePublicUrl(input.url);
    } catch (err) {
      if (err instanceof SsrfRejection) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'URL rejected',
          code: err.code,
          detail: err.message,
        });
      }
      throw err;
    }

    const created = (await this.prisma.publicVisualAnalysisRun.create({
      data: {
        userId: input.userId,
        url: normalized.url,
        status: 'RUNNING',
      },
    })) as unknown as RawRun;

    // BullMQ'ya job at. JobId unique kalsın diye runId kullanılıyor.
    await this.scanQueue.add(
      JOB_VISUAL_PUBLIC_ANALYZE,
      { runId: created.id, url: normalized.url },
      {
        jobId: `${JOB_ID_VISUAL_PUBLIC_PREFIX}:${created.id}`,
        attempts: 1,
        removeOnComplete: { age: 86400, count: 200 },
        removeOnFail: { age: 604800, count: 200 },
      },
    );

    return toListItem(created);
  }

  // GET /visual-analysis/public
  async list(userId: string, limit = 20): Promise<PublicVisualAnalysisListItem[]> {
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const runs = (await this.prisma.publicVisualAnalysisRun.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    })) as unknown as RawRun[];
    return runs.map(toListItem);
  }

  // GET /visual-analysis/public/:id
  async getOne(userId: string, runId: string): Promise<PublicVisualAnalysisDetail> {
    const run = (await this.prisma.publicVisualAnalysisRun.findFirst({
      where: { id: runId, userId },
    })) as unknown as RawRun | null;
    if (!run) {
      throw new NotFoundException('Public visual analysis not found');
    }
    return toDetail(run);
  }

  // GET /visual-analysis/public/:id/screenshot
  async getScreenshot(userId: string, runId: string): Promise<StreamableFile> {
    const run = (await this.prisma.publicVisualAnalysisRun.findFirst({
      where: { id: runId, userId },
      select: { id: true, userId: true, screenshotPath: true },
    })) as { id: string; userId: string; screenshotPath: string | null } | null;

    if (!run) {
      throw new NotFoundException('Public visual analysis not found');
    }
    if (!run.screenshotPath) {
      throw new NotFoundException('Screenshot not available');
    }

    const allowedRoot = resolveAllowedRoot();
    const resolved = path.resolve(run.screenshotPath);
    const prefixWithSep = allowedRoot.endsWith(path.sep) ? allowedRoot : allowedRoot + path.sep;
    if (resolved !== allowedRoot && !resolved.startsWith(prefixWithSep)) {
      throw new ForbiddenException('Screenshot path not allowed');
    }

    try {
      await fsp.access(resolved, fs.constants.R_OK);
    } catch {
      throw new NotFoundException('Screenshot not available');
    }

    const stream = fs.createReadStream(resolved);
    return new StreamableFile(stream, { type: 'image/png' });
  }
}
