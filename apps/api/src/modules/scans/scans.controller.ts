import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ScansService } from './scans.service';
import { FakeAuthGuard } from '../../common/fake-auth.guard';

interface AuthedRequest {
  user: { id: string; email: string };
}

@UseGuards(FakeAuthGuard)
@Controller('scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post('run-now')
  runNow(@Req() req: AuthedRequest, @Query('assetId') assetId: string) {
    return this.scansService.runNow(req.user.id, assetId);
  }

  @Get('history')
  history(@Req() req: AuthedRequest, @Query('assetId') assetId: string) {
    return this.scansService.history(req.user.id, assetId);
  }
}