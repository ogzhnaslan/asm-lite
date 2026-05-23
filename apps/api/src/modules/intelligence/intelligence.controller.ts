import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/current-user.decorator';
import { IntelligenceService } from './intelligence.service';
import type { PassiveLookupAskResult, PassiveLookupHistoryResult, PassiveLookupRunRecord } from './intelligence.service';
import { PassiveLookupAskDto } from './dto/passive-lookup-ask.dto';

@ApiTags('intelligence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  @ApiOperation({
    summary: 'Passive threat intelligence lookup — no active scan, no findings, no asset creation',
    description:
      'Returns OTX threat intelligence for the given domain or IP. ' +
      'Does NOT perform port scanning, HTTP/TLS connections, or DNS resolution. ' +
      'Results are saved to passive lookup history but never stored as assets or findings.',
  })
  @ApiQuery({ name: 'target', required: true, description: 'Domain (e.g. example.com) or IPv4 (e.g. 1.2.3.4)' })
  @Get('lookup')
  lookup(
    @Query('target') target: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.intelligenceService.passiveLookup(target, user.id);
  }

  @ApiOperation({ summary: 'Passive lookup history — returns current user\'s past queries' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Get('history')
  async getHistory(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PassiveLookupHistoryResult> {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const l = Math.min(50, Math.max(1, parseInt(limit ?? '50', 10) || 50));
    return this.intelligenceService.getHistory(user.id, p, l);
  }

  @ApiOperation({ summary: 'Passive lookup history detail' })
  @ApiParam({ name: 'id' })
  @Get('history/:id')
  async getHistoryDetail(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PassiveLookupRunRecord> {
    const run = await this.intelligenceService.getHistoryDetail(id, user.id);
    if (!run) throw new NotFoundException('Passive lookup record not found');
    return run;
  }

  @ApiOperation({
    summary: 'Ask AI about a passive lookup result',
    description:
      'Answers questions about a specific passive lookup record using OTX data as context. ' +
      'Only the record owner can ask questions. Chat is not persisted.',
  })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: PassiveLookupAskDto })
  @Post('history/:id/ask')
  async ask(
    @Param('id') id: string,
    @Body() body: PassiveLookupAskDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PassiveLookupAskResult> {
    return this.intelligenceService.askPassiveLookup(id, user.id, body.question);
  }
}
