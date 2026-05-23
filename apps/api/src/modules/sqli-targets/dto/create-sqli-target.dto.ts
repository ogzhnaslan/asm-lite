import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

// Allowed HTTP methods for SQLi probe targets (MVP: only GET).
// Deep validation of `paramsJson` shape (max 5 keys, value types, length) and
// cross-field rules (`injectParam` must be a key of `paramsJson`, path antipatterns)
// are enforced in SqliTargetsService.validateFields, since class-validator does
// not deeply inspect object contents.
export class CreateSqliTargetDto {
  @ApiProperty({ enum: ['GET'], description: 'HTTP method — MVP destination only GET' })
  @IsString()
  @IsIn(['GET'], { message: 'method must be GET' })
  method!: 'GET';

  @ApiProperty({ example: '/product', description: 'Path relative to asset value, must start with /, max 256 chars' })
  @IsString()
  @IsNotEmpty({ message: 'path is required' })
  @MaxLength(256, { message: 'path must be at most 256 characters' })
  path!: string;

  @ApiProperty({ example: { id: '1' }, description: 'Query parameters, max 5 keys, string values only' })
  @IsObject({ message: 'paramsJson must be a plain object' })
  paramsJson!: Record<string, string>;

  @ApiProperty({ example: 'id', description: 'Parameter to inject SQLi payloads into — must be a key of paramsJson' })
  @IsString()
  @IsNotEmpty({ message: 'injectParam is required' })
  @MaxLength(64, { message: 'injectParam must be at most 64 characters' })
  injectParam!: string;

  @ApiProperty({ required: false, default: true, description: 'Whether this target is active for SQLi probes' })
  @IsOptional()
  @IsBoolean({ message: 'enabled must be a boolean' })
  enabled?: boolean;
}
