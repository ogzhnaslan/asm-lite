import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { QUEUE_SCAN, JOB_SCAN_RUN, JOB_ID_MANUAL_PREFIX } from "../queue/queue.constants";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AssetStatus, ScanRunStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_SCAN) private readonly scanQueue: Queue,
  ) { }

  async history(userId: string, assetId: string, page = 1, limit = 20) {
    if (!assetId) {
      throw new BadRequestException("assetId is required");
    }

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId },
      select: { id: true },
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.scanRun.findMany({
        where: { assetId },
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          assetId: true,
          startedAt: true,
          finishedAt: true,
          status: true,
          // findingsCount: tarama bitişinde dondurulan kalıcı sayı (scanRunId
          // taşınmasından etkilenmez). _count.findings yerine bunu kullanıyoruz.
          findingsCount: true,
        },
      }),
      this.prisma.scanRun.count({ where: { assetId } }),
    ]);

    return { items, total, page, limit };
  }

  // Bir taramanın TÜM check sonuçları (temiz + sorunlu) — "akış" görünümü için.
  // Ownership: scanRun → asset → userId. Bulgu (Finding) değil, ham check
  // snapshot'larını (ScanCheckResult) döndürür; frontend her tip için durum+özet üretir.
  async checks(
    userId: string,
    scanRunId: string,
  ): Promise<{
    scanRunId: string;
    status: ScanRunStatus;
    items: Array<{ id: string; type: string; dataJson: unknown; createdAt: Date }>;
  }> {
    if (!scanRunId) {
      throw new BadRequestException("scanRunId is required");
    }

    const run = await this.prisma.scanRun.findFirst({
      where: { id: scanRunId, asset: { userId } },
      select: { id: true, status: true, startedAt: true, finishedAt: true },
    });

    if (!run) {
      throw new NotFoundException("Scan not found");
    }

    const checks = await this.prisma.scanCheckResult.findMany({
      where: { scanRunId },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, dataJson: true, createdAt: true },
    });

    return { scanRunId: run.id, status: run.status, items: checks };
  }

  async runNow(userId: string, assetId: string) {
    if (!assetId) {
      throw new BadRequestException("assetId is required");
    }

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId },
      select: { id: true, status: true, type: true, value: true },
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    if (asset.status !== AssetStatus.VERIFIED) {
      throw new ForbiddenException("Asset is not verified");
    }

    const run = await this.prisma.scanRun.create({
      data: {
        assetId: asset.id,
        status: ScanRunStatus.RUNNING,
      },
      select: { id: true, startedAt: true, status: true },
    });

    await this.scanQueue.add(
      JOB_SCAN_RUN,
      { scanRunId: run.id, assetId: asset.id },
      {
        jobId: `${JOB_ID_MANUAL_PREFIX}:${run.id}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
        removeOnFail: { age: 60 * 60 * 24 * 7, count: 1000 },
      },
    );

    return {
      ok: true,
      scanRunId: run.id,
      status: "QUEUED",
    };
  }
}
