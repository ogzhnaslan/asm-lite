import { Controller, Get, Query, Param, Post } from '@nestjs/common';
import { FindingsService } from './findings.service';

@Controller('findings')
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get()
  list(@Query('assetId') assetId: string) {
    return this.findingsService.list(assetId);
  }
  @Post(':id/ack')
ack(@Param('id') id: string) {
  return this.findingsService.ack(id);
}
}