import { Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { FindingsService } from './findings.service';
import { FakeAuthGuard } from '../../common/fake-auth.guard';

interface AuthedRequest {
  user: { id: string; email: string };
}

@UseGuards(FakeAuthGuard)
@Controller('findings')
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query('assetId') assetId: string) {
    return this.findingsService.list(req.user.id, assetId);
  }

  @Patch(':id/ack')
  ack(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.findingsService.ack(req.user.id, id);
  }
}
