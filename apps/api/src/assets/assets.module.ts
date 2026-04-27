import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { ScansModule } from '../modules/scans/scans.module';

@Module({
  imports: [ScansModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
