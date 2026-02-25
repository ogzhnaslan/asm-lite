import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FindingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(assetId: string) {
    if (!assetId) throw new BadRequestException('assetId is required');

    return this.prisma.finding.findMany({
      where: { assetId },
      orderBy: [{ aiScore: 'desc' }, { lastSeenAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // ADIM 6B: Finding acknowledge (okundu işareti)
  async ack(id: string) {
    if (!id) throw new BadRequestException('id is required');

    const existing = await this.prisma.finding.findFirst({
      where: { id },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException('Finding not found');

    return this.prisma.finding.update({
      where: { id },
      data: {
        isNew: false,
        lastSeenAt: new Date(),
      },
    });
  }
}