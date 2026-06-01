import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FindingsService } from './findings.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/current-user.decorator';

@ApiTags('findings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('findings')
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @ApiOperation({ summary: 'List findings for an asset' })
  @ApiQuery({ name: 'assetId', required: true })
  @ApiQuery({ name: 'severity', required: false, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @ApiQuery({ name: 'resolved', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'isNew', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('assetId') assetId: string,
    @Query('severity') severity?: string,
    @Query('resolved') resolved?: string,
    @Query('isNew') isNew?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    return this.findingsService.list(user.id, assetId, {
      severity,
      resolved,
      isNew,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @ApiOperation({ summary: 'Acknowledge a finding (mark as seen)' })
  @Patch(':id/ack')
  ack(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.findingsService.ack(user.id, id);
  }

  @ApiOperation({ summary: 'Manually resolve a finding (set resolvedAt; reopened on next scan if issue persists)' })
  @Patch(':id/resolve')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.findingsService.resolve(user.id, id);
  }

  @ApiOperation({ summary: 'Reopen a manually resolved finding (clear resolvedAt)' })
  @Patch(':id/reopen')
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.findingsService.reopen(user.id, id);
  }
}
