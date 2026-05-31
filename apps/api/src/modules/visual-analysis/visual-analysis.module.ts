import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { VisualAnalysisController } from './visual-analysis.controller';
import { VisualAnalysisService } from './visual-analysis.service';

// Visual Website Analyzer geçmiş ve screenshot servisi.
// Sadece okuma — yazma (VisualAnalysisRun create) worker tarafında, scan sırasında.
// Screenshot servisi path traversal'a karşı VISUAL_SCREENSHOT_DIR allowlist root
// kontrolü yapar; raw screenshotPath response'a dahil edilmez.
@Module({
  imports: [PrismaModule],
  controllers: [VisualAnalysisController],
  providers: [VisualAnalysisService],
})
export class VisualAnalysisModule {}
