import { BullModule } from "@nestjs/bullmq";
import { Controller, Get, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { INGEST_QUEUE_NAME } from "@personal-gpt/shared";

import { DocumentEntity } from "../../web/lib/db/entities/document.entity";
import { EntityAclEntity } from "../../web/lib/db/entities/entity-acl.entity";
import { EntityCatalogEntity } from "../../web/lib/db/entities/entity-catalog.entity";
import { IngestJobEntity } from "../../web/lib/db/entities/ingest-job.entity";
import { WorkspaceEntity } from "../../web/lib/db/entities/workspace.entity";

import { IngestModule } from "./ingest/ingest.module";

@Controller()
class HealthController {
  @Get("health")
  health() {
    return { status: "ok", queue: INGEST_QUEUE_NAME };
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
