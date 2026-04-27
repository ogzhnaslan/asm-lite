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
  list(@CurrentUser() user: AuthUser, @Query('assetId') assetId: string) {
    return this.findingsService.list(user.id, assetId);
  }

  @Patch(':id/ack')
  ack(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.findingsService.ack(user.id, id);
  }
}
