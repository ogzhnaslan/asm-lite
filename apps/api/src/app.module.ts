import { Module } from "@nestjs/common";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AssetsModule } from "./assets/assets.module";
import { ScansModule } from "./modules/scans/scans.module";
import { FindingsModule } from "./modules/findings/findings.module";
import { QueueModule } from "./modules/queue/queue.module";
import { ScanQueueModule } from "./modules/queue/scan-queue.module";
import { AssistantModule } from "./modules/assistant/assistant.module";
import { IntelligenceModule } from "./modules/intelligence/intelligence.module";
import { VisualAnalysisModule } from "./modules/visual-analysis/visual-analysis.module";
import { PublicVisualAnalysisModule } from "./modules/public-visual/public-visual.module";
import { SqliTargetsModule } from "./modules/sqli-targets/sqli-targets.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60,
      },
    ]),
    PrismaModule,
    AuthModule,
    AssetsModule,
    ScansModule,
    FindingsModule,
    QueueModule,
    ScanQueueModule,
    AssistantModule,
    IntelligenceModule,
    SqliTargetsModule,
    VisualAnalysisModule,
    PublicVisualAnalysisModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
