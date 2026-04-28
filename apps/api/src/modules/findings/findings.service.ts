import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

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

  async list(userId: string, assetId: string, filters: ListFilters = {}) {
    if (!assetId) throw new BadRequestException('assetId is required');

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId },
      select: { id: true },
    });

    if (!asset) throw new NotFoundException('Asset not found');

    if (filters.severity && !VALID_SEVERITIES.includes(filters.severity.toUpperCase())) {
      throw new BadRequestException(`Geçersiz severity. Seçenekler: ${VALID_SEVERITIES.join(', ')}`);
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

  async ack(userId: string, id: string) {
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
}