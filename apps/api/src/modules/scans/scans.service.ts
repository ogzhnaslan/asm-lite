import axios from 'axios';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type HealthOk = { url: string; statusCode: number; latencyMs: number };
type HealthFail = { url: string; statusCode: null; latencyMs: null; error: string };
type HealthResult = HealthOk | HealthFail;

@Injectable()
export class ScansService {
  constructor(private readonly prisma: PrismaService) {}

  // ADIM 6A: Scan history (asset bazlı run listesi)
  async history(assetId: string) {
    if (!assetId) throw new BadRequestException('assetId is required');

    return this.prisma.scanRun.findMany({
      where: { assetId },
      orderBy: [{ startedAt: 'desc' }],
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
    if (!assetId) throw new BadRequestException('assetId is required');

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId },
      select: { id: true, status: true, type: true, value: true },
    });

    if (!asset) throw new NotFoundException('Asset not found');
    if (asset.status !== 'VERIFIED') throw new ForbiddenException('Asset is not verified');

    // 1) ScanRun oluştur (RUNNING)
    const run = await this.prisma.scanRun.create({
      data: {
        assetId: asset.id,
        status: 'RUNNING',
      },
      select: { id: true, startedAt: true, status: true },
    });

    try {
      // 2) HTTP Health Check (https -> http fallback)
      const domain = asset.value;

      const attempt = async (url: string): Promise<HealthOk> => {
        const started = Date.now();
        const res = await axios.get(url, {
          timeout: 5000,
          validateStatus: () => true, // 4xx/5xx exception yapmasın
        });
        return { url, statusCode: res.status, latencyMs: Date.now() - started };
      };

      let health: HealthResult;

      try {
        health = await attempt(`https://${domain}`);
      } catch {
        try {
          health = await attempt(`http://${domain}`);
        } catch {
          health = {
            url: `https://${domain}`,
            statusCode: null,
            latencyMs: null,
            error: 'HTTP request failed (timeout/DNS/connection)',
          };
        }
      }

      // 3) Finding oluşturma kuralı (MVP)
      // - statusCode null => CRITICAL
      // - statusCode >= 500 => HIGH
      // - aksi halde finding yazma (MVP)
      const shouldCreateFinding =
        health.statusCode === null ||
        (typeof health.statusCode === 'number' && health.statusCode >= 500);

      if (shouldCreateFinding) {
        const severity =
          health.statusCode === null ? 'CRITICAL' : health.statusCode >= 500 ? 'HIGH' : 'LOW';

        const key = `HTTP_HEALTH:${domain}`;

        const aiScore = health.statusCode === null ? 95 : health.statusCode >= 500 ? 85 : 20;

        const aiWhyJson = {
          reasons:
            health.statusCode === null
              ? ['HTTP request failed (timeout/DNS/connection)']
              : [`HTTP status ${health.statusCode}`],
          signals: health,
        };

        // Unique key (assetId+key) varsa update, yoksa create
        const existing = await this.prisma.finding.findFirst({
          where: { assetId: asset.id, key },
          select: { id: true },
        });

        if (existing) {
          await this.prisma.finding.update({
            where: { id: existing.id },
            data: {
              scanRunId: run.id,
              type: 'HTTP_HEALTH',
              severity,
              dataJson: health as any,
              aiScore,
              aiWhyJson,
              isNew: false,
              lastSeenAt: new Date(),
            },
          });
        } else {
          await this.prisma.finding.create({
            data: {
              assetId: asset.id,
              scanRunId: run.id,
              type: 'HTTP_HEALTH',
              key,
              severity,
              dataJson: health as any,
              aiScore,
              aiWhyJson,
              isNew: true,
              lastSeenAt: new Date(),
            },
          });
        }
      }

      // 4) ScanRun bitir (DONE)
      const finished = await this.prisma.scanRun.update({
        where: { id: run.id },
        data: {
          status: 'DONE',
          finishedAt: new Date(),
        },
        select: { id: true, startedAt: true, finishedAt: true, status: true },
      });

      return {
        ok: true,
        message: shouldCreateFinding
          ? 'Scan finished. Finding recorded.'
          : 'Scan finished. No finding (healthy).',
        asset,
        health,
        run: finished,
      };
    } catch (err) {
      // 5) Hata varsa FAILED yap
      await this.prisma.scanRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
        },
      });

      throw new InternalServerErrorException('Scan failed');
    }
  }
}