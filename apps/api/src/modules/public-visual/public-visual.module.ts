import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ScanQueueModule } from '../queue/scan-queue.module';
import { PublicVisualAnalysisController } from './public-visual.controller';
import { PublicVisualAnalysisService } from './public-visual.service';

@Module({
  imports: [PrismaModule, ScanQueueModule],
  controllers: [PublicVisualAnalysisController],
  providers: [PublicVisualAnalysisService],
})
export class PublicVisualAnalysisModule {}
