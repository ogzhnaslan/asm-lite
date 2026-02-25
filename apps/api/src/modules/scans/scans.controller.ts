console.log('✅ ScansController file loaded');
import { Controller, Get, Post, Query } from '@nestjs/common';
import { ScansService } from './scans.service';

@Controller('scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post('run-now')
  async runNow(@Query('assetId') assetId: string) {
    return this.scansService.runNow(assetId);
  }
  @Get('history')
history(@Query('assetId') assetId: string) {
  return this.scansService.history(assetId);
}
}