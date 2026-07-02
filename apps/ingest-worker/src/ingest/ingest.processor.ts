import { Processor, WorkerHost } from "@nestjs/bullmq";
import { INGEST_QUEUE_NAME } from "@personal-gpt/shared";
import type { IngestJobPayload } from "@personal-gpt/shared";
import type { Job } from "bullmq";

/**
 * BullMQ ingest 消费者占位；完整 pipeline 在 Task 2 实现。
 */
@Processor(INGEST_QUEUE_NAME, { concurrency: 2 })
export class IngestProcessor extends WorkerHost {
  async process(job: Job<IngestJobPayload>): Promise<void> {
    await job.updateProgress(0);
    // pipeline: parse → split → embed → upsert（Task 2）
    void job.data.documentId;
  }
}
