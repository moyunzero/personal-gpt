/**
 * 知识库跨 app 共享类型（web / ingest-worker / agent-service）。
 * 与 enterprise-roadmap Phase 1.2 PG schema 对齐。
 */

/** Phase 1 默认 workspace；多租户 UI 在 Phase 4 引入 */
export type WorkspaceId = string;

export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

export type IngestJobStatus = "queued" | "active" | "completed" | "failed";

/** 聊天回答下方展示的引用卡片 */
export interface Citation {
  documentId: string;
  title: string;
  /** 0–1 相似度，前端可格式化为百分比 */
  similarity: number;
  snippet: string;
  source?: string;
  category?: string;
}

/** PostgreSQL documents 表元数据子集 */
export interface DocumentMeta {
  id: string;
  workspaceId: WorkspaceId;
  title: string;
  source?: string;
  category?: string;
  tags?: string[];
  status: DocumentStatus;
  chunkCount?: number;
  mimeType?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** BullMQ ingest 队列 job payload */
export interface IngestJobPayload {
  workspaceId: WorkspaceId;
  documentId: string;
  filePath: string;
  mimeType: string;
  title?: string;
  category?: string;
  tags?: string[];
}
