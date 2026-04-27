import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FindingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, assetId: string) {
    if (!assetId) throw new BadRequestException('assetId is required');

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId },
      select: { id: true },
    });

    if (!asset) throw new NotFoundException('Asset not found');

    return this.prisma.finding.findMany({
      where: { assetId },
      orderBy: [{ aiScore: 'desc' }, { lastSeenAt: 'desc' }, { createdAt: 'desc' }],
    });
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