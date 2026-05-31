import { Controller, Get, Param, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/current-user.decorator';
import { VisualAnalysisService } from './visual-analysis.service';
import type {
  VisualAnalysisDetail,
  VisualAnalysisListItem,
} from './visual-analysis.service';

@ApiTags('visual-analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assets/:assetId/visual-analysis')
export class VisualAnalysisController {
  constructor(private readonly service: VisualAnalysisService) {}

  @ApiOperation({ summary: 'List recent visual analysis runs for a verified asset' })
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Query('limit') limit?: string,
  ): Promise<VisualAnalysisListItem[]> {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    return this.service.list(user.id, assetId, Number.isFinite(parsed) ? (parsed as number) : undefined);
  }

  @ApiOperation({ summary: 'Visual analysis run detail (includes visibleText + raw analysis)' })
  @Get(':runId')
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Param('runId') runId: string,
  ): Promise<VisualAnalysisDetail> {
    return this.service.getOne(user.id, assetId, runId);
  }

  @ApiOperation({ summary: 'Screenshot PNG for a visual analysis run (image/png stream)' })
  @Get(':runId/screenshot')
  getScreenshot(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Param('runId') runId: string,
  ): Promise<StreamableFile> {
    return this.service.getScreenshot(user.id, assetId, runId);
  }
}
