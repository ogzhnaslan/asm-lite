import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssistantContextService } from './assistant-context.service';
import { AssistantLlmService } from './assistant-llm.service';

export interface AssistantChatResponse {
  answer: string;
  usedContext: {
    asset: boolean;
    findings: number;
    intelligence: boolean;
    scanRuns: number;
  };
  model: string;
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextService: AssistantContextService,
    private readonly llmService: AssistantLlmService,
  ) {}

  async chat(userId: string, assetId: string, message: string): Promise<AssistantChatResponse> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId },
      select: { value: true, type: true, status: true, critical: true, scanInterval: true },
    });

    if (!asset) throw new NotFoundException('Asset bulunamadı');

    const ctx = await this.contextService.build(assetId, {
      value: asset.value,
      type: asset.type,
      status: asset.status,
      critical: asset.critical,
      scanInterval: asset.scanInterval,
    });

    const contextPrompt = this.contextService.formatForPrompt(ctx, message);

    let llmResult: { answer: string; model: string };
    try {
      llmResult = await this.llmService.chat(contextPrompt);
    } catch {
      llmResult = {
        answer: 'AI servisi şu anda erişilemiyor. Lütfen daha sonra tekrar deneyin.',
        model: 'none',
      };
    }

    return {
      answer: llmResult.answer,
      usedContext: {
        asset: true,
        findings: ctx.findings.activeCount,
        intelligence: ctx.hasIntelligence,
        scanRuns: ctx.scanRuns.length,
      },
      model: llmResult.model,
    };
  }
}
