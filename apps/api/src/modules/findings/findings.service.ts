import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SEVERITIES } from '@asm/shared';

interface ListFilters {
  severity?: string;
  resolved?: string;
  isNew?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class FindingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, assetId: string, filters: ListFilters = {}): Promise<{ items: unknown[]; total: number; page: number; limit: number }> {
    if (!assetId) throw new BadRequestException('assetId is required');

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId },
      select: { id: true },
    });

    if (!asset) throw new NotFoundException('Asset not found');

    if (filters.severity && !(SEVERITIES as readonly string[]).includes(filters.severity.toUpperCase())) {
      throw new BadRequestException(`Invalid severity. Valid options: ${SEVERITIES.join(', ')}`);
    }

    const where: Record<string, unknown> = { assetId };

    if (filters.severity) where.severity = filters.severity.toUpperCase();
    if (filters.resolved === 'true') where.resolvedAt = { not: null };
    if (filters.resolved === 'false') where.resolvedAt = null;
    if (filters.isNew === 'true') where.isNew = true;
    if (filters.isNew === 'false') where.isNew = false;

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.finding.findMany({
        where,
        orderBy: [{ aiScore: 'desc' }, { lastSeenAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.finding.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async ack(userId: string, id: string): Promise<unknown> {
    if (!id) throw new BadRequestException('id is required');

    const finding = await this.prisma.finding.findFirst({
      where: { id },
      select: { id: true, asset: { select: { userId: true } } },
    });

    if (!finding || finding.asset.userId !== userId) {
      throw new NotFoundException('Finding not found');
    }

    return this.prisma.finding.update({
      where: { id },
      data: {
        isNew: false,
        lastSeenAt: new Date(),
      },
    });
  }

  // Ortak ownership doğrulaması — finding kullanıcının bir asset'ine mi ait?
  private async assertOwnership(userId: string, id: string): Promise<void> {
    if (!id) throw new BadRequestException('id is required');

    const finding = await this.prisma.finding.findFirst({
      where: { id },
      select: { id: true, asset: { select: { userId: true } } },
    });

    if (!finding || finding.asset.userId !== userId) {
      throw new NotFoundException('Finding not found');
    }
  }

  // Manuel resolve — kullanıcı bulguyu elle kapatır. resolvedAt set edilir,
  // isNew false yapılır. NOT: sorun bir sonraki taramada hâlâ mevcutsa worker
  // upsertFinding ile bulguyu yeniden açar (resolvedAt=null). Yani manuel resolve
  // kalıcı bir "yok say" değil; geçerli durumun kabulüdür.
  async resolve(userId: string, id: string): Promise<unknown> {
    await this.assertOwnership(userId, id);

    return this.prisma.finding.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        isNew: false,
        lastSeenAt: new Date(),
      },
    });
  }

  // Manuel reopen — elle kapatılmış bir bulguyu yeniden açar (resolvedAt=null).
  async reopen(userId: string, id: string): Promise<unknown> {
    await this.assertOwnership(userId, id);

    return this.prisma.finding.update({
      where: { id },
      data: {
        resolvedAt: null,
        lastSeenAt: new Date(),
      },
    });
  }
}