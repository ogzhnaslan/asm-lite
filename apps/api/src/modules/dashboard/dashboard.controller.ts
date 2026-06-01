import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/current-user.decorator';
import { DashboardService } from './dashboard.service';
import type { DashboardTrends } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @ApiOperation({
    summary: 'Global finding severity trend (all assets) for the last 7d/30d + derived insight',
  })
  @ApiQuery({ name: 'window', required: false, enum: ['7d', '30d'] })
  @Get('trends')
  trends(
    @CurrentUser() user: AuthUser,
    @Query('window') window?: string,
  ): Promise<DashboardTrends> {
    return this.service.trends(user.id, window);
  }
}
