import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ScansService } from './scans.service';
import { FakeAuthGuard } from '../../common/fake-auth.guard';

@UseGuards(FakeAuthGuard)
@Controller('scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post('run-now')
  runNow(@Query('assetId') assetId: string) {
    return this.scansService.runNow(assetId);
  }

  @Get('history')
  history(@Query('assetId') assetId: string) {
    return this.scansService.history(assetId);
  }
}