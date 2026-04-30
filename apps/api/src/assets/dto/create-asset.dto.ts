import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAssetDto {
  @IsOptional()
  @IsIn(['DOMAIN', 'IP'])
  type?: 'DOMAIN' | 'IP';

  @IsString()
  @IsNotEmpty()
  value: string;
}
