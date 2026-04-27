import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AssetsModule } from "./assets/assets.module";
import { ScansModule } from "./modules/scans/scans.module";
import { FindingsModule } from "./modules/findings/findings.module";
import { QueueModule } from "./modules/queue/queue.module";
import { ScanQueueModule } from "./modules/queue/scan-queue.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AssetsModule,
    ScansModule,
    FindingsModule,
    QueueModule,
    ScanQueueModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}