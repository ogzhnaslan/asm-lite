import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { FindingsService } from './findings.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('findings')
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('assetId') assetId: string,
    @Query('severity') severity?: string,
    @Query('resolved') resolved?: string,
    @Query('isNew') isNew?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.findingsService.list(user.id, assetId, {
      severity,
      resolved,
      isNew,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Patch(':id/ack')
  ack(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.findingsService.ack(user.id, id);
  }
}
