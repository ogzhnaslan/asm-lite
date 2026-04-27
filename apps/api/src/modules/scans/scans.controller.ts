import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ScansService } from './scans.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post('run-now')
  runNow(@CurrentUser() user: AuthUser, @Query('assetId') assetId: string) {
    return this.scansService.runNow(user.id, assetId);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query('assetId') assetId: string) {
    return this.scansService.history(user.id, assetId);
  }
}
