console.log('✅ ScansModule file loaded');
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { AssetsModule } from './assets/assets.module';
import { ScansModule } from './modules/scans/scans.module';
import { FindingsModule } from './modules/findings/findings.module';
@Module({
  imports: [PrismaModule, AssetsModule, ScansModule, FindingsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}