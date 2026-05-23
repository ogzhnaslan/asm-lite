import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantContextService } from './assistant-context.service';
import { AssistantLlmService } from './assistant-llm.service';

@Module({
  imports: [PrismaModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantContextService, AssistantLlmService],
})
export class AssistantModule {}
