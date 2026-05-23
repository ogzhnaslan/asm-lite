import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/current-user.decorator';
import { SqliTargetsService } from './sqli-targets.service';
import type { SqliTargetResponse, DeleteSqliTargetResponse } from './sqli-targets.service';
import { CreateSqliTargetDto } from './dto/create-sqli-target.dto';
import { UpdateSqliTargetDto } from './dto/update-sqli-target.dto';

@ApiTags('sqli-targets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assets/:assetId/sqli-targets')
export class SqliTargetsController {
  constructor(private readonly service: SqliTargetsService) {}

  @ApiOperation({ summary: 'List SQLi targets for a verified asset' })
  @Get()
  list(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string): Promise<SqliTargetResponse[]> {
    return this.service.list(user.id, assetId);
  }

  @ApiOperation({ summary: 'Create a new SQLi probe target (max 5 per asset)' })
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Body() body: CreateSqliTargetDto,
  ): Promise<SqliTargetResponse> {
    return this.service.create(user.id, assetId, body);
  }

  @ApiOperation({ summary: 'Update an SQLi target (path, params, injectParam, enabled)' })
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Param('id') id: string,
    @Body() body: UpdateSqliTargetDto,
  ): Promise<SqliTargetResponse> {
    return this.service.update(user.id, assetId, id, body);
  }

  @ApiOperation({ summary: 'Delete an SQLi target' })
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Param('id') id: string,
  ): Promise<DeleteSqliTargetResponse> {
    return this.service.remove(user.id, assetId, id);
  }
}
