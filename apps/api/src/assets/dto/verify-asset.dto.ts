import { IsOptional, IsString, IsUrl } from 'class-validator';

export class VerifyHttpDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url: string;
}

export class VerifyDnsDto {
  @IsOptional()
  @IsString()
  domain?: string;
}
