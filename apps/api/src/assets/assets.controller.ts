import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AssetsService } from "./assets.service";
import { FakeAuthGuard } from "../common/fake-auth.guard";

interface AuthedRequest {
  user: { id: string; email: string };
}

@UseGuards(FakeAuthGuard)
@Controller("assets")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) { }

  // Domain/IP ekle
  @Post()
  async create(@Req() req: AuthedRequest, @Body() body: { type?: "DOMAIN" | "IP"; value: string }) {
    return this.assetsService.create(req.user.id, body);
  }

  // Kullanıcının asset'lerini listele
  @Get()
  async list(@Req() req: AuthedRequest) {
    return this.assetsService.list(req.user.id);
  }

  // Verify token üret (HTTP file doğrulama için)
  @Post(":id/verify/request-token")
  async requestToken(@Req() req: AuthedRequest, @Param("id") id: string) {
    return this.assetsService.requestHttpToken(req.user.id, id);
  }
  // Verify token üret (DNS TXT doğrulama için)
  @Post(":id/verify/request-dns-token")
  async requestDnsToken(@Req() req: AuthedRequest, @Param("id") id: string) {
    return this.assetsService.requestDnsToken(req.user.id, id);
  }
  // HTTP verify: URL'den tokenı okuyup asset'i VERIFIED yapar
  @Post(":id/verify/http")
  async verifyHttp(
    @Req() req: AuthedRequest,
    @Param("id") id: string,
    @Body() body: { url: string },
  ) {
    return this.assetsService.verifyHttp(req.user.id, id, body.url);
  }

  // DNS verify: DNS TXT kaydından tokenı okuyup asset'i VERIFIED yapar
  @Post(":id/verify/dns")
  async verifyDns(
    @Req() req: AuthedRequest,
    @Param("id") id: string,
    @Body() body: { domain?: string },
  ) {
    return this.assetsService.verifyDns(req.user.id, id, body.domain);
  }
}