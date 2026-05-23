import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AssetsService } from "./assets.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { AuthUser } from "../common/current-user.decorator";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { SetCriticalDto, UpdateScanIntervalDto } from "./dto/update-asset.dto";
import { VerifyDnsDto, VerifyHttpDto } from "./dto/verify-asset.dto";

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("assets")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @ApiOperation({ summary: 'Add new asset (domain or IP)' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAssetDto) {
    return this.assetsService.create(user.id, body);
  }

  @ApiOperation({ summary: 'List all assets' })
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.assetsService.list(user.id, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @ApiOperation({ summary: 'Get asset by id' })
  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assetsService.get(user.id, id);
  }

  @ApiOperation({ summary: 'Delete asset' })
  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assetsService.remove(user.id, id);
  }

  @ApiOperation({ summary: 'Update scan interval' })
  @Patch(":id/scan-interval")
  updateScanInterval(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdateScanIntervalDto,
  ) {
    return this.assetsService.updateScanInterval(user.id, id, body.interval);
  }

  @ApiOperation({ summary: 'Set asset as critical' })
  @Patch(":id/critical")
  setCritical(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: SetCriticalDto,
  ) {
    return this.assetsService.setCritical(user.id, id, body.critical);
  }

  @ApiOperation({ summary: 'Get latest intelligence snapshots for an asset' })
  @Get(":id/intelligence")
  getIntelligence(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assetsService.getIntelligence(user.id, id);
  }

  @ApiOperation({ summary: 'Dev-only instant verification (disabled in production)' })
  @Post(":id/verify/dev")
  devVerify(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assetsService.devVerify(user.id, id);
  }

  @ApiOperation({ summary: 'Request HTTP verification token' })
  @Post(":id/verify/request-token")
  requestToken(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assetsService.requestHttpToken(user.id, id);
  }

  @ApiOperation({ summary: 'Request DNS verification token' })
  @Post(":id/verify/request-dns-token")
  requestDnsToken(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assetsService.requestDnsToken(user.id, id);
  }

  @ApiOperation({ summary: 'Complete HTTP ownership verification' })
  @Post(":id/verify/http")
  verifyHttp(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: VerifyHttpDto,
  ) {
    return this.assetsService.verifyHttp(user.id, id, body.url);
  }

  @ApiOperation({ summary: 'Complete DNS ownership verification' })
  @Post(":id/verify/dns")
  verifyDns(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: VerifyDnsDto,
  ) {
    return this.assetsService.verifyDns(user.id, id, body.domain);
  }
}
