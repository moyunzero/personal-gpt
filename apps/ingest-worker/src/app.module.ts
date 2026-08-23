import { BullModule } from "@nestjs/bullmq";
import { Controller, Get, Module, Res } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import type { Response } from "express";

import { INGEST_QUEUE_NAME } from "@personal-gpt/shared";

import { DocumentEntity } from "../../web/lib/db/entities/document.entity";
import { EntityAclEntity } from "../../web/lib/db/entities/entity-acl.entity";
import { EntityCatalogEntity } from "../../web/lib/db/entities/entity-catalog.entity";
import { IngestJobEntity } from "../../web/lib/db/entities/ingest-job.entity";
import { WorkspaceEntity } from "../../web/lib/db/entities/workspace.entity";

import { IngestModule } from "./ingest/ingest.module";
import { metricsContentType, metricsText } from "./metrics";

@Controller()
class HealthController {
  @Get("health")
  health() {
    return { status: "ok", queue: INGEST_QUEUE_NAME };
  }

  @Get("metrics")
  async metrics(@Res() res: Response): Promise<void> {
    res.setHeader("Content-Type", metricsContentType());
    res.send(await metricsText());
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("REDIS_URL");
        if (!url) {
          throw new Error(
            "[ingest-worker] REDIS_URL 未设置。请 cp .env.example .env 并 yarn docker:up。",
          );
        }
        return { connection: { url } };
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("DATABASE_URL");
        if (!url) {
          throw new Error(
            "[ingest-worker] DATABASE_URL 未设置。请 cp .env.example .env 并 yarn docker:up。",
          );
        }
        return {
          type: "postgres" as const,
          url,
          synchronize: false,
          logging: false,
          entities: [
            WorkspaceEntity,
            DocumentEntity,
            IngestJobEntity,
            EntityCatalogEntity,
            EntityAclEntity,
          ],
        };
      },
    }),
    IngestModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
