import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Job } from "bullmq";
import * as fs from "node:fs/promises";
import { Repository } from "typeorm";

import { INGEST_QUEUE_NAME } from "@personal-gpt/shared";
import type { IngestJobPayload } from "@personal-gpt/shared";
import { getEnv } from "@personal-gpt/shared/schemas/env";
import { DocumentEntity } from "../../../web/lib/db/entities/document.entity";
import { IngestJobEntity } from "../../../web/lib/db/entities/ingest-job.entity";

import { deleteDocument } from "./pipeline/delete";
import { embedChunks } from "./pipeline/embed";
import { parseDocument } from "./pipeline/parse";
import { splitText, toChunkRecords } from "./pipeline/split";
import { traceIngestStep } from "./pipeline/tracing";
import { upsertChunks } from "./pipeline/upsert";

@Injectable()
@Processor(INGEST_QUEUE_NAME, { concurrency: 2 })
export class IngestProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestProcessor.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    @InjectRepository(IngestJobEntity)
    private readonly ingestJobRepo: Repository<IngestJobEntity>,
  ) {
    super();
  }

  async process(job: Job<IngestJobPayload>): Promise<void> {
    const { workspaceId, documentId, filePath, mimeType, title, category, tags } = job.data;

    const maxBytes = getEnv().UPLOAD_MAX_BYTES;
    const stat = await fs.stat(filePath);
    if (stat.size > maxBytes) {
      throw new Error(`File exceeds upload limit: ${stat.size} bytes`);
    }

    const bullJobId = String(job.id ?? job.name);
    const ingestJob = await this.findIngestJob(documentId, bullJobId);

    await this.updateIngestJob(ingestJob?.id, {
      status: "active",
      progress: 0,
      bullJobId: String(job.id ?? job.name),
    });
    await this.documentRepo.update({ id: documentId, workspaceId }, { status: "processing" });
    await job.updateProgress(0);

    const traceCtx = {
      workspaceId,
      documentId,
      requestId: bullJobId,
    };

    try {
      const text = await traceIngestStep("parse", traceCtx, () =>
        parseDocument(filePath, mimeType),
      );
      await job.updateProgress(25);
      await this.updateIngestJob(ingestJob?.id, { progress: 25 });

      const chunks = await traceIngestStep("split", traceCtx, () => splitText(text));
      await job.updateProgress(50);
      await this.updateIngestJob(ingestJob?.id, { progress: 50 });

      const vectors = await traceIngestStep("embed", traceCtx, () => embedChunks(chunks));
      await job.updateProgress(75);
      await this.updateIngestJob(ingestJob?.id, { progress: 75 });

      const document = await this.documentRepo.findOne({
        where: { id: documentId, workspaceId },
      });
      const records = toChunkRecords(chunks, vectors, {
        workspaceId,
        documentId,
        title: title ?? document?.title,
        source: document?.source ?? undefined,
        category: category ?? document?.category ?? undefined,
        tags: tags ?? document?.tags,
      });

      await traceIngestStep("upsert", traceCtx, () => upsertChunks(records));
      await job.updateProgress(100);

      await this.documentRepo.update(
        { id: documentId, workspaceId },
        { status: "ready", chunkCount: chunks.length },
      );
      await this.updateIngestJob(ingestJob?.id, {
        status: "completed",
        progress: 100,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Ingest failed for document ${documentId}: ${message}`);

      try {
        await deleteDocument(workspaceId, documentId, "user");
      } catch (cleanupErr) {
        this.logger.warn(
          `Vector cleanup after ingest failure failed: ${
            cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
          }`,
        );
      }

      await this.documentRepo.update({ id: documentId, workspaceId }, { status: "failed" });
      await this.updateIngestJob(ingestJob?.id, {
        status: "failed",
        error: message,
      });

      throw error;
    }
  }

  private async findIngestJob(
    documentId: string,
    bullJobId: string,
  ): Promise<IngestJobEntity | null> {
    const byBull = await this.ingestJobRepo.findOne({
      where: { bullJobId },
    });
    if (byBull) return byBull;

    return this.ingestJobRepo.findOne({
      where: { documentId },
      order: { createdAt: "DESC" },
    });
  }

  private async updateIngestJob(
    ingestJobId: string | undefined,
    patch: Partial<Pick<IngestJobEntity, "status" | "progress" | "error" | "bullJobId">>,
  ): Promise<void> {
    if (!ingestJobId) return;
    await this.ingestJobRepo.update({ id: ingestJobId }, patch);
  }
}
