import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PassiveLookupQueryDto {
  @ApiProperty({ description: 'Domain or IP to look up passively (no active scan)' })
  @IsString()
  @IsNotEmpty({ message: 'target is required' })
  @MaxLength(253, { message: 'target is too long' })
  target!: string;
}
