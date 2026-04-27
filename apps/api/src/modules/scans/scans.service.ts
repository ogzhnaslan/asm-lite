import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { QUEUE_SCAN, JOB_SCAN_RUN } from "../queue/queue.constants";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_SCAN) private readonly scanQueue: Queue,
  ) { }

  async history(assetId: string) {
    if (!assetId) {
      throw new BadRequestException("assetId is required");
    }

    return this.prisma.scanRun.findMany({
      where: { assetId },
      orderBy: [{ startedAt: "desc" }],
      select: {
        id: true,
        assetId: true,
        startedAt: true,
        finishedAt: true,
        status: true,
      },
    });
  }

  async runNow(assetId: string) {
    if (!assetId) {
      throw new BadRequestException("assetId is required");
    }

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId },
      select: { id: true, status: true, type: true, value: true },
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    if (asset.status !== "VERIFIED") {
      throw new ForbiddenException("Asset is not verified");
    }

    const run = await this.prisma.scanRun.create({
      data: {
        assetId: asset.id,
        status: "RUNNING",
      },
      select: { id: true, startedAt: true, status: true },
    });

    await this.scanQueue.add(
      JOB_SCAN_RUN,
      { scanRunId: run.id, assetId: asset.id },
      {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    );

    return {
      ok: true,
      scanRunId: run.id,
      status: "QUEUED",
    };
  }
}