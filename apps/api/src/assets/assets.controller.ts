import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: { type?: 'DOMAIN' | 'IP'; value: string }) {
    return this.assetsService.create(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.assetsService.list(user.id);
  }

  @Post(':id/verify/request-token')
  requestToken(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assetsService.requestHttpToken(user.id, id);
  }

  @Post(':id/verify/request-dns-token')
  requestDnsToken(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assetsService.requestDnsToken(user.id, id);
  }

  @Post(':id/verify/http')
  verifyHttp(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { url: string },
  ) {
    return this.assetsService.verifyHttp(user.id, id, body.url);
  }

  @Post(':id/verify/dns')
  verifyDns(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { domain?: string },
  ) {
    return this.assetsService.verifyDns(user.id, id, body.domain);
  }
}
