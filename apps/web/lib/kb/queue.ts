import { Queue, QueueEvents } from "bullmq";

import {
  INGEST_DEFAULT_JOB_OPTIONS,
  INGEST_QUEUE_NAME,
} from "@personal-gpt/shared/constants/queue";

let ingestQueue: Queue | null = null;
let ingestQueueEvents: QueueEvents | null = null;

/** 读取 Redis 连接配置；KB producer 与 SSE 共用 */
function getRedisConnection(): { url: string } {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("[kb/queue] REDIS_URL 未设置。请 cp .env.example .env 并 yarn docker:up。");
  }
  return { url };
}

/** BullMQ ingest 队列 producer 单例（web 侧入队） */
export function getIngestQueue(): Queue {
  if (!ingestQueue) {
    ingestQueue = new Queue(INGEST_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: INGEST_DEFAULT_JOB_OPTIONS,
    });
  }
  return ingestQueue;
}

/** QueueEvents 单例，供 SSE /api/kb/jobs/:id/stream 订阅 progress */
export function getIngestQueueEvents(): QueueEvents {
  if (!ingestQueueEvents) {
    ingestQueueEvents = new QueueEvents(INGEST_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return ingestQueueEvents;
}
