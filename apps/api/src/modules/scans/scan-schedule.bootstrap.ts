import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanScheduleService } from './scan-schedule.service';

// API ayağa kalkınca tarama zamanlamalarını DB ile senkronize eder:
// birikmiş duplicate scheduler'ları ve silinmiş-asset orphan repeatable'larını
// temizleyip yalnızca VERIFIED asset'ler için birer scheduler kurar. Hata
// uygulamanın açılışını engellemez (yalnızca loglanır).
@Injectable()
export class ScanScheduleBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScanScheduleBootstrap.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScanScheduleService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const verified = await this.prisma.asset.findMany({
        where: { status: AssetStatus.VERIFIED },
        select: { id: true, scanInterval: true },
      });
      await this.schedule.reconcile(verified);
    } catch (err) {
      this.logger.error(`scan schedule reconcile failed: ${(err as Error).message}`);
    }
  }
}
