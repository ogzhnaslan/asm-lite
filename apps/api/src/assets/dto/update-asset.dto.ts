import { IsBoolean, IsIn } from 'class-validator';
import { SCAN_INTERVALS } from '@asm/shared';

export class SetCriticalDto {
  @IsBoolean()
  critical: boolean;
}

export class UpdateScanIntervalDto {
  @IsIn([...SCAN_INTERVALS])
  interval: string;
}
