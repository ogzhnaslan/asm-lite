import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/current-user.decorator';
import { CreatePublicVisualAnalysisDto } from './dto/create-public-visual.dto';
import {
  PublicVisualAnalysisService,
  PublicVisualAnalysisDetail,
  PublicVisualAnalysisListItem,
} from './public-visual.service';

@ApiTags('public-visual-analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('visual-analysis/public')
export class PublicVisualAnalysisController {
  constructor(private readonly service: PublicVisualAnalysisService) {}

  @ApiOperation({
    summary: 'Start a public URL visual analysis (SSRF-guarded, no asset required)',
  })
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreatePublicVisualAnalysisDto,
  ): Promise<PublicVisualAnalysisListItem> {
    return this.service.create({ userId: user.id, url: body.url });
  }

  @ApiOperation({ summary: 'List recent public visual analysis runs for current user' })
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ): Promise<PublicVisualAnalysisListItem[]> {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    return this.service.list(user.id, Number.isFinite(parsed) ? (parsed as number) : undefined);
  }

  @ApiOperation({ summary: 'Public visual analysis run detail (used by polling)' })
  @Get(':runId')
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string,
  ): Promise<PublicVisualAnalysisDetail> {
    return this.service.getOne(user.id, runId);
  }

  @ApiOperation({ summary: 'Screenshot PNG for a public visual analysis run' })
  @Get(':runId/screenshot')
  getScreenshot(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string,
  ): Promise<StreamableFile> {
    return this.service.getScreenshot(user.id, runId);
  }
}
