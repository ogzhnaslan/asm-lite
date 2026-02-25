import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AssetsService } from "./assets.service";
import { FakeAuthGuard } from "../common/fake-auth.guard";

@UseGuards(FakeAuthGuard)
@Controller("assets")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  // Domain/IP ekle
  @Post()
  async create(@Req() req: any, @Body() body: { type?: "DOMAIN" | "IP"; value: string }) {
    return this.assetsService.create(req.user.id, body);
  }

  // Kullanıcının asset'lerini listele
  @Get()
  async list(@Req() req: any) {
    return this.assetsService.list(req.user.id);
  }

  // Verify token üret (HTTP file doğrulama için)
  @Post(":id/verify/request-token")
  async requestToken(@Req() req: any, @Param("id") id: string) {
    return this.assetsService.requestHttpToken(req.user.id, id);
  }

  // HTTP verify: URL'den tokenı okuyup asset'i VERIFIED yapar
  @Post(":id/verify/http")
  async verifyHttp(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { url: string },
  ) {
    return this.assetsService.verifyHttp(req.user.id, id, body.url);
  }
}