import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import type { IngestJobPayload } from "@personal-gpt/shared/types/kb";
import { normalizeUploadMime } from "@personal-gpt/shared/utils/ingest";
import { getUploadsDir } from "@personal-gpt/shared/utils/paths";
import { deleteByDocumentId, resolveCorpusTargets } from "@personal-gpt/shared";
import {
  createVectorStore,
  shouldWriteAstra,
  shouldWriteMilvus,
} from "@personal-gpt/shared/stores/vector-store";
import { createMilvusVectorStore } from "@personal-gpt/shared/stores/vector-store.milvus";

import { DocumentEntity } from "@/lib/db/entities/document.entity";
import { IngestJobEntity } from "@/lib/db/entities/ingest-job.entity";
import { getDataSource } from "@/lib/db/get-data-source";
import { env } from "@/lib/env";

import { getIngestQueue } from "./queue";

/** MIME → 存储扩展名（服务端生成，禁止用户指定路径） */
const MIME_EXT_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "text/markdown": "md",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export class UploadValidationError extends Error {
  constructor(
    public readonly code: "mime_not_allowed" | "file_too_large" | "empty_file",
    message: string,
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export class ReindexBusyError extends Error {
  constructor() {
    super("文档正在导入中，请稍后再试");
    this.name = "ReindexBusyError";
  }
}

function escapeIlikePattern(raw: string): string {
  return raw.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

export interface UploadFileInput {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ListDocumentsParams {
  page?: number;
  limit?: number;
  category?: string;
  tags?: string[];
  status?: string;
  search?: string;
}

export interface DocumentWithJob {
  document: DocumentEntity;
  job: IngestJobEntity | null;
}

/** monorepo 根目录 uploads/（web 与 ingest-worker 共用绝对路径） */
export { getUploadsDir } from "@personal-gpt/shared/utils/paths";

/** 上传前校验：MIME 白名单 + 20MB 上限（D-13） */
export function validateUploadFile(
  file: Pick<UploadFileInput, "type" | "size">,
  options: {
    allowedMimeTypes: readonly string[];
    maxBytes: number;
  } = {
    allowedMimeTypes: env.ALLOWED_MIME_TYPES,
    maxBytes: env.UPLOAD_MAX_BYTES,
  },
): void {
  if (file.size <= 0) {
    throw new UploadValidationError("empty_file", "文件为空");
  }
  if (!options.allowedMimeTypes.includes(file.type)) {
    throw new UploadValidationError("mime_not_allowed", `不支持的文件类型：${file.type}`);
  }
  if (file.size > options.maxBytes) {
    throw new UploadValidationError(
      "file_too_large",
      `文件超过 ${Math.round(options.maxBytes / 1024 / 1024)}MB 上限`,
    );
  }
}

function resolveExtension(mimeType: string): string {
  const ext = MIME_EXT_MAP[mimeType];
  if (!ext) {
    throw new UploadValidationError("mime_not_allowed", `无法解析扩展名：${mimeType}`);
  }
  return ext;
}

function parseTagsParam(raw: string | null): string[] | undefined {
  if (!raw?.trim()) return undefined;
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** 将 document 行映射为 API JSON（含最近 ingest job） */
export function serializeDocumentRow(document: DocumentEntity, job: IngestJobEntity | null) {
  return {
    id: document.id,
    workspaceId: document.workspaceId,
    title: document.title,
    source: document.source,
    category: document.category,
    tags: document.tags,
    status: document.status,
    chunkCount: document.chunkCount,
    mimeType: document.mimeType,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    latestJob: job
      ? {
          id: job.id,
          status: job.status,
          progress: job.progress,
          error: job.error,
          bullJobId: job.bullJobId,
        }
      : null,
  };
}

async function saveUploadToDisk(file: UploadFileInput, mimeType: string): Promise<string> {
  const ext = resolveExtension(mimeType);
  const fileName = `${randomUUID()}.${ext}`;
  const uploadsDir = getUploadsDir();
  await fs.mkdir(uploadsDir, { recursive: true });
  const absolutePath = path.join(uploadsDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absolutePath, buffer);
  return absolutePath;
}

async function enqueueIngestJob(
  document: DocumentEntity,
  payload: IngestJobPayload,
): Promise<IngestJobEntity> {
  const ds = await getDataSource();
  const jobRepo = ds.getRepository(IngestJobEntity);

  const ingestJob = jobRepo.create({
    workspaceId: DEFAULT_WORKSPACE_ID,
    documentId: document.id,
    status: "queued",
    progress: 0,
    error: null,
    bullJobId: null,
  });
  await jobRepo.save(ingestJob);

  const queue = getIngestQueue();
  const bullJob = await queue.add(`ingest-${document.id}`, payload);
  await jobRepo.update({ id: ingestJob.id }, { bullJobId: String(bullJob.id) });

  ingestJob.bullJobId = String(bullJob.id);
  return ingestJob;
}

/** 上传文件：落盘 → 建 document(pending) → 入队 BullMQ */
export async function uploadDocument(
  file: UploadFileInput,
  meta: { title?: string; category?: string; tags?: string[] } = {},
): Promise<DocumentWithJob> {
  const mimeType = normalizeUploadMime(file.name, file.type);
  validateUploadFile({ type: mimeType, size: file.size });

  const filePath = await saveUploadToDisk(file, mimeType);
  const title = meta.title?.trim() || file.name.replace(/\.[^.]+$/, "") || file.name;

  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);

  const document = docRepo.create({
    workspaceId: DEFAULT_WORKSPACE_ID,
    title,
    source: file.name,
    category: meta.category ?? null,
    tags: meta.tags ?? [],
    status: "pending",
    chunkCount: 0,
    filePath,
    mimeType,
  });
  await docRepo.save(document);

  const payload: IngestJobPayload = {
    workspaceId: DEFAULT_WORKSPACE_ID,
    documentId: document.id,
    filePath,
    mimeType,
    title: document.title,
    category: document.category ?? undefined,
    tags: document.tags,
  };

  const job = await enqueueIngestJob(document, payload);
  return { document, job };
}

/** 分页列表 + category/tags/status/title 过滤（KB-03） */
export async function listDocuments(params: ListDocumentsParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);
  const jobRepo = ds.getRepository(IngestJobEntity);

  const qb = docRepo.createQueryBuilder("doc").where("doc.workspace_id = :workspaceId", {
    workspaceId: DEFAULT_WORKSPACE_ID,
  });

  if (params.category) {
    qb.andWhere("doc.category = :category", { category: params.category });
  }
  if (params.status) {
    qb.andWhere("doc.status = :status", { status: params.status });
  }
  if (params.search?.trim()) {
    qb.andWhere("doc.title ILIKE :search ESCAPE '\\\\'", {
      search: `%${escapeIlikePattern(params.search.trim())}%`,
    });
  }
  if (params.tags?.length) {
    qb.andWhere("doc.tags ?| array[:...tags]", { tags: params.tags });
  }

  qb.orderBy("doc.created_at", "DESC").skip(skip).take(limit);

  const [documents, total] = await qb.getManyAndCount();

  const docIds = documents.map((d) => d.id);
  const jobs =
    docIds.length > 0
      ? await jobRepo
          .createQueryBuilder("job")
          .where("job.document_id IN (:...docIds)", { docIds })
          .orderBy("job.created_at", "DESC")
          .getMany()
      : [];

  const latestJobByDoc = new Map<string, IngestJobEntity>();
  for (const job of jobs) {
    if (!latestJobByDoc.has(job.documentId)) {
      latestJobByDoc.set(job.documentId, job);
    }
  }

  return {
    items: documents.map((doc) => serializeDocumentRow(doc, latestJobByDoc.get(doc.id) ?? null)),
    page,
    limit,
    total,
  };
}

export async function getDocumentById(documentId: string): Promise<DocumentWithJob | null> {
  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);
  const jobRepo = ds.getRepository(IngestJobEntity);

  const document = await docRepo.findOne({
    where: { id: documentId, workspaceId: DEFAULT_WORKSPACE_ID },
  });
  if (!document) return null;

  const job = await jobRepo.findOne({
    where: { documentId: document.id },
    order: { createdAt: "DESC" },
  });

  return { document, job: job ?? null };
}

export async function updateDocumentMetadata(
  documentId: string,
  patch: { title?: string; category?: string | null; tags?: string[] },
): Promise<DocumentEntity | null> {
  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);

  const document = await docRepo.findOne({
    where: { id: documentId, workspaceId: DEFAULT_WORKSPACE_ID },
  });
  if (!document) return null;

  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (trimmed) document.title = trimmed;
  }
  if (patch.category !== undefined) {
    document.category = patch.category;
  }
  if (patch.tags !== undefined) {
    document.tags = patch.tags;
  }

  return docRepo.save(document);
}

/**
 * 删除文档（INGEST-04 / Pitfall 5）：
 * 先删 Astra 向量 → 再删本地文件 → 最后删 PG 行。
 */
export async function deleteDocument(documentId: string): Promise<boolean> {
  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);

  const document = await docRepo.findOne({
    where: { id: documentId, workspaceId: DEFAULT_WORKSPACE_ID },
  });
  if (!document) return false;

  if (shouldWriteAstra()) {
    await createVectorStore({ corpus: "user" }).deleteByDocument(
      DEFAULT_WORKSPACE_ID,
      documentId,
    );
  }
  if (shouldWriteMilvus()) {
    await createMilvusVectorStore({ corpus: "user" }).deleteByDocument(
      DEFAULT_WORKSPACE_ID,
      documentId,
    );
  }
  // D-09: keep ES in sync with vector stores on document delete
  await deleteByDocumentId(resolveCorpusTargets("user").esIndex, DEFAULT_WORKSPACE_ID, documentId);

  if (document.filePath) {
    try {
      await fs.unlink(document.filePath);
    } catch {
      // 文件可能已不存在，不阻塞 PG 删除
    }
  }

  await docRepo.delete({ id: documentId, workspaceId: DEFAULT_WORKSPACE_ID });
  return true;
}

/** 重新索引（INGEST-05 / D-21）：processing + 新 job + 同路径入队，无确认 */
export async function reindexDocument(
  documentId: string,
): Promise<{ document: DocumentEntity; job: IngestJobEntity } | null> {
  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);

  const document = await docRepo.findOne({
    where: { id: documentId, workspaceId: DEFAULT_WORKSPACE_ID },
  });
  if (!document?.filePath || !document.mimeType) return null;
  if (document.status === "processing") {
    throw new ReindexBusyError();
  }

  await docRepo.update(
    { id: documentId, workspaceId: DEFAULT_WORKSPACE_ID },
    { status: "processing", chunkCount: 0 },
  );
  document.status = "processing";
  document.chunkCount = 0;

  const payload: IngestJobPayload = {
    workspaceId: DEFAULT_WORKSPACE_ID,
    documentId: document.id,
    filePath: document.filePath,
    mimeType: document.mimeType,
    title: document.title,
    category: document.category ?? undefined,
    tags: document.tags,
  };

  const job = await enqueueIngestJob(document, payload);
  return { document, job };
}

/** 按 ingest_job id 查 job（SSE 鉴权：必须属于 default workspace） */
export { getIngestJobById } from "./ingest-jobs.service";

export { parseTagsParam };
