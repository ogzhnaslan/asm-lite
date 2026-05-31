import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePublicVisualAnalysisDto {
  @ApiProperty({
    description: 'Public URL to analyze (http or https)',
    example: 'https://example.com',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url!: string;
}
