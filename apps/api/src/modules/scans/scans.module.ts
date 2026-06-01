import { Module } from '@nestjs/common';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { ScanScheduleService } from './scan-schedule.service';
import { ScanScheduleBootstrap } from './scan-schedule.bootstrap';
import { PrismaModule } from '../../prisma/prisma.module';
import { ScanQueueModule } from '../queue/scan-queue.module';

@Module({
  imports: [PrismaModule, ScanQueueModule],
  controllers: [ScansController],
  providers: [ScansService, ScanScheduleService, ScanScheduleBootstrap],
  exports: [ScanScheduleService],
})
export class ScansModule {}