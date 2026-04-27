import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { FindingsService } from './findings.service';
import { FakeAuthGuard } from '../../common/fake-auth.guard';

@UseGuards(FakeAuthGuard)
@Controller('findings')
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get()
  list(@Query('assetId') assetId: string) {
    return this.findingsService.list(assetId);
  }

  @Patch(':id/ack')
  ack(@Param('id') id: string) {
    return this.findingsService.ack(id);
  }
}
