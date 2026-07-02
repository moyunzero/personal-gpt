/**
 * BullMQ ingest 队列名与默认 job 选项（D-00a）。
 * web producer 与 ingest-worker consumer 共用。
 */

export const INGEST_QUEUE_NAME = "ingest";

export const INGEST_DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "fixed" as const, delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};
