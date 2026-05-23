import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SqliTargetsController } from './sqli-targets.controller';
import { SqliTargetsService } from './sqli-targets.service';

// Manuel SQLi probe target CRUD modülü.
// VERIFIED asset + ownership zorunlu. Worker SQLi check'i bu hedefleri okur
// (Adım C / E), modül kendi başına probe çalıştırmaz.
@Module({
  imports: [PrismaModule],
  controllers: [SqliTargetsController],
  providers: [SqliTargetsService],
})
export class SqliTargetsModule {}
