import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { AssistantService } from './assistant.service';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/current-user.decorator';

@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('assets/:id/assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @ApiOperation({ summary: 'Chat with AI assistant about an asset (Türkçe)' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiBody({ type: AssistantChatDto })
  @Post('chat')
  chat(
    @CurrentUser() user: AuthUser,
    @Param('id') assetId: string,
    @Body() body: AssistantChatDto,
  ) {
    return this.assistantService.chat(user.id, assetId, body.message);
  }
}
