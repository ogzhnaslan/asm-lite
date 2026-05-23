import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AssistantLlmService } from '../assistant/assistant-llm.service';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';
import { OtxLookupService } from './otx-lookup.service';

// Passive threat intelligence lookups + history + AI chat.
// Writes to PassiveLookupRun only — never touches Asset, ScanRun, or Finding.
@Module({
  imports: [PrismaModule],
  controllers: [IntelligenceController],
  providers: [IntelligenceService, OtxLookupService, AssistantLlmService],
})
export class IntelligenceModule {}
