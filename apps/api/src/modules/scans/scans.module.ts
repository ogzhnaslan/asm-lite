import { Module } from '@nestjs/common';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ScanQueueModule } from '../queue/scan-queue.module';

@Module({
  imports: [PrismaModule, ScanQueueModule],
  controllers: [ScansController],
  providers: [ScansService],
})
export class ScansModule { }