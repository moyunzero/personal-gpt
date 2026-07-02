import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import {
  INGEST_DEFAULT_JOB_OPTIONS,
  INGEST_QUEUE_NAME,
} from "@personal-gpt/shared";

import { DocumentEntity } from "../../../web/lib/db/entities/document.entity";
import { IngestJobEntity } from "../../../web/lib/db/entities/ingest-job.entity";
import { WorkspaceEntity } from "../../../web/lib/db/entities/workspace.entity";

import { IngestProcessor } from "./ingest.processor";

@Module({
  imports: [
    BullModule.registerQueue({
      name: INGEST_QUEUE_NAME,
      defaultJobOptions: INGEST_DEFAULT_JOB_OPTIONS,
    }),
    TypeOrmModule.forFeature([DocumentEntity, IngestJobEntity, WorkspaceEntity]),
  ],
  providers: [IngestProcessor],
})
export class IngestModule {}
