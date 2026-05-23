import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PassiveLookupAskDto {
  @ApiProperty({ description: 'Kullanıcının sorusu (max 1000 karakter)' })
  @IsString()
  @IsNotEmpty({ message: 'question is required' })
  @MaxLength(1000, { message: 'question must be at most 1000 characters' })
  question!: string;
}
