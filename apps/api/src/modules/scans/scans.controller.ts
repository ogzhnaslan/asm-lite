import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ScansService } from './scans.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/current-user.decorator';

@ApiTags('scans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @ApiOperation({ summary: 'Queue a scan immediately for an asset' })
  @ApiQuery({ name: 'assetId', required: true, description: 'Scan başlatılacak asset ID' })
  @Post('run-now')
  runNow(@CurrentUser() user: AuthUser, @Query('assetId') assetId: string) {
    return this.scansService.runNow(user.id, assetId);
  }

  @ApiOperation({ summary: 'Get scan history for an asset' })
  @ApiQuery({ name: 'assetId', required: true, description: 'Geçmişi sorgulanacak asset ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Sayfa başına kayıt (varsayılan: 20, maks: 50)' })
  @Get('history')
  history(
    @CurrentUser() user: AuthUser,
    @Query('assetId') assetId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.scansService.history(
      user.id,
      assetId,
      page ? Math.max(1, parseInt(page, 10)) : 1,
      limit ? Math.min(50, Math.max(1, parseInt(limit, 10))) : 20,
    );
  }
}
