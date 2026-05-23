import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

// All fields optional — partial update. Cross-field validation (effective merged
// state must still satisfy: injectParam ∈ paramsJson.keys, path antipatterns,
// paramsJson deep shape) is enforced in SqliTargetsService.validateFields.
export class UpdateSqliTargetDto {
  @ApiProperty({ required: false, enum: ['GET'] })
  @IsOptional()
  @IsString()
  @IsIn(['GET'], { message: 'method must be GET' })
  method?: 'GET';

  @ApiProperty({ required: false, example: '/product' })
  @IsOptional()
  @IsString()
  @MaxLength(256, { message: 'path must be at most 256 characters' })
  path?: string;

  @ApiProperty({ required: false, example: { id: '1' } })
  @IsOptional()
  @IsObject({ message: 'paramsJson must be a plain object' })
  paramsJson?: Record<string, string>;

  @ApiProperty({ required: false, example: 'id' })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'injectParam must be at most 64 characters' })
  injectParam?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean({ message: 'enabled must be a boolean' })
  enabled?: boolean;
}
