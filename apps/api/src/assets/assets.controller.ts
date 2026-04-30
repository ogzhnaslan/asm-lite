import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AssetsService } from "./assets.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { AuthUser } from "../common/current-user.decorator";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { SetCriticalDto, UpdateScanIntervalDto } from "./dto/update-asset.dto";
import { VerifyDnsDto, VerifyHttpDto } from "./dto/verify-asset.dto";

@UseGuards(JwtAuthGuard)
@Controller("assets")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAssetDto) {
    return this.assetsService.create(user.id, body);
  }

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

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assetsService.get(user.id, id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assetsService.remove(user.id, id);
  }

  @Patch(":id/scan-interval")
  updateScanInterval(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdateScanIntervalDto,
  ) {
    return this.assetsService.updateScanInterval(user.id, id, body.interval);
  }

  @Patch(":id/critical")
  setCritical(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: SetCriticalDto,
  ) {
    return this.assetsService.setCritical(user.id, id, body.critical);
  }

  @Post(":id/verify/dev")
  devVerify(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assetsService.devVerify(user.id, id);
  }

  @Post(":id/verify/request-token")
  requestToken(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assetsService.requestHttpToken(user.id, id);
  }

  @Post(":id/verify/request-dns-token")
  requestDnsToken(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assetsService.requestDnsToken(user.id, id);
  }

  @Post(":id/verify/http")
  verifyHttp(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: VerifyHttpDto,
  ) {
    return this.assetsService.verifyHttp(user.id, id, body.url);
  }

  @Post(":id/verify/dns")
  verifyDns(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: VerifyDnsDto,
  ) {
    return this.assetsService.verifyDns(user.id, id, body.domain);
  }
}
