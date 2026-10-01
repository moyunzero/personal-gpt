import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";

import type { IngestJobPayload } from "@personal-gpt/shared/types/kb";
import { normalizeUploadMime } from "@personal-gpt/shared/utils/ingest";
import { getUploadsDir } from "@personal-gpt/shared/utils/paths";
import {
  deleteByDocumentId,
  deleteCatalogForDocument,
  deleteGraphForDocument,
  isEsConfigured,
  resolveCorpusTargets,
} from "@personal-gpt/shared";
import {
  createVectorStore,
  shouldWriteAstra,
  shouldWriteMilvus,
} from "@personal-gpt/shared/stores/vector-store";
import { createMilvusVectorStore } from "@personal-gpt/shared/stores/vector-store.milvus";

import { DocumentEntity, type DocumentVisibility } from "@/lib/db/entities/document.entity";
import { IngestJobEntity } from "@/lib/db/entities/ingest-job.entity";
import {
  canReadDocument,
  canWriteDocument,
  defaultDocumentVisibility,
} from "@/lib/auth/document-acl";
import { resolveDocumentAccessContext } from "@/lib/auth/workspace.service";
import { assertRestrictedAllowlist } from "@/lib/auth/restricted-visibility";
import { createEntityCatalogStore } from "@/lib/db/entity-catalog-store";
import { getDataSource } from "@/lib/db/get-data-source";
import { env } from "@/lib/env";
import { deleteStoredObject, isMinioConfigured, uploadToMinio } from "@/lib/storage/minio";
import {
  isTrustedVercelBlobUrl,
  isVercelBlobConfigured,
  uploadToVercelBlob,
} from "@/lib/storage/vercel-blob";

import { documentVisibilitySql } from "./list-documents-acl";
import { getIngestQueue } from "./queue";
import { assertRemoteUploadWithinLimits } from "./remote-upload-assert";

function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** MIME → 存储扩展名（服务端生成，禁止用户指定路径） */
const MIME_EXT_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "text/markdown": "md",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export class UploadValidationError extends Error {
  constructor(
    public readonly code:
      | "mime_not_allowed"
      | "file_too_large"
      | "empty_file"
      | "storage_unavailable"
      | "untrusted_url"
      | "queue_unavailable",
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

export interface DocumentsContext {
  userId: string;
  workspaceId: string;
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
    visibility: document.visibility,
    ownerId: document.ownerId,
    restrictedUserIds: document.restrictedUserIds ?? [],
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

async function saveUpload(file: UploadFileInput, mimeType: string): Promise<string> {
  const ext = resolveExtension(mimeType);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (isMinioConfigured()) {
    return uploadToMinio(buffer, mimeType, ext);
  }

  // Vercel / Lambda 只读文件系统：必须用对象存储（Blob / MinIO）
  if (isVercelBlobConfigured()) {
    return uploadToVercelBlob(buffer, mimeType, ext);
  }

  if (isServerlessRuntime()) {
    throw new UploadValidationError(
      "storage_unavailable",
      "生产环境未配置对象存储：请设置 BLOB_READ_WRITE_TOKEN（Vercel Blob）或 MinIO（MINIO_*）后再上传",
    );
  }

  const fileName = `${randomUUID()}.${ext}`;
  const uploadsDir = getUploadsDir();
  await fs.mkdir(uploadsDir, { recursive: true });
  const absolutePath = path.join(uploadsDir, fileName);
  await fs.writeFile(absolutePath, buffer);
  return absolutePath;
}

async function enqueueIngestJob(
  document: DocumentEntity,
  payload: IngestJobPayload,
  workspaceId: string,
): Promise<IngestJobEntity> {
  const ds = await getDataSource();
  const jobRepo = ds.getRepository(IngestJobEntity);

  // insert（非 save）：避开 TypeORM SubjectTopologicalSorter 的 Cyclic dependency（prod 常显示为 "d"）
  const id = randomUUID();
  await jobRepo.insert({
    id,
    workspaceId,
    documentId: document.id,
    status: "queued",
    progress: 0,
    error: null,
    bullJobId: null,
  });

  const queue = getIngestQueue();
  const bullJobId = id;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let bullJob;
  try {
    bullJob = await Promise.race([
      queue.add(`ingest-${document.id}`, payload, { jobId: bullJobId }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("导入队列没有响应，请确认 Redis 已启动"));
        }, 8000);
      }),
    ]);
  } catch (error) {
    bullJob = await queue.getJob(bullJobId).catch(() => undefined);
    if (!bullJob) {
      const message = error instanceof Error ? error.message : "导入队列不可用";
      await jobRepo.update({ id }, { status: "failed", error: message });
      await ds
        .getRepository(DocumentEntity)
        .update({ id: document.id, workspaceId }, { status: "failed" });
      throw new UploadValidationError("queue_unavailable", message);
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
  await jobRepo.update({ id }, { bullJobId: String(bullJob.id) });

  return {
    id,
    workspaceId,
    documentId: document.id,
    status: "queued",
    progress: 0,
    error: null,
    bullJobId: String(bullJob.id),
  } as IngestJobEntity;
}

type UploadMetaInput = {
  title?: string;
  category?: string;
  tags?: string[];
  visibility?: DocumentVisibility;
  restrictedUserIds?: string[];
};

async function createPendingDocumentAndEnqueue(
  ctx: DocumentsContext,
  file: { name: string; mimeType: string; filePath: string },
  meta: UploadMetaInput = {},
): Promise<DocumentWithJob> {
  const title = meta.title?.trim() || file.name.replace(/\.[^.]+$/, "") || file.name;

  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);

  // insert（非 save）：同 chat 消息修复，避免 DocumentEntity relation 拓扑环
  const id = randomUUID();
  const visibility = meta.visibility ?? defaultDocumentVisibility();
  const restrictedUserIds =
    visibility === "restricted" ? assertRestrictedAllowlist(meta.restrictedUserIds) : [];
  const tags = meta.tags ?? [];
  const category = meta.category ?? null;
  await docRepo.insert({
    id,
    workspaceId: ctx.workspaceId,
    ownerId: ctx.userId,
    visibility,
    restrictedUserIds,
    title,
    source: file.name,
    category,
    tags,
    status: "pending",
    chunkCount: 0,
    filePath: file.filePath,
    mimeType: file.mimeType,
  });

  // 必须回读：insert 不回填 CreateDateColumn，否则 serialize 会炸 toISOString
  const document = await docRepo.findOneByOrFail({ id });

  const payload: IngestJobPayload = {
    workspaceId: ctx.workspaceId,
    documentId: document.id,
    filePath: file.filePath,
    mimeType: file.mimeType,
    title: document.title,
    category: document.category ?? undefined,
    tags: document.tags,
  };

  const job = await enqueueIngestJob(document, payload, ctx.workspaceId);
  return { document, job };
}

/** 上传文件：落盘 → 建 document(pending) → 入队 BullMQ */
export async function uploadDocument(
  file: UploadFileInput,
  ctx: DocumentsContext,
  meta: UploadMetaInput = {},
): Promise<DocumentWithJob> {
  const mimeType = normalizeUploadMime(file.name, file.type);
  validateUploadFile({ type: mimeType, size: file.size });

  const filePath = await saveUpload(file, mimeType);
  return createPendingDocumentAndEnqueue(ctx, { name: file.name, mimeType, filePath }, meta);
}

/**
 * 浏览器已直传 Vercel Blob 后，仅登记 URL（不经 Serverless 请求体传文件）。
 */
export async function uploadDocumentFromRemote(
  input: { fileUrl: string; fileName: string; mimeType: string; size: number },
  ctx: DocumentsContext,
  meta: UploadMetaInput = {},
): Promise<DocumentWithJob> {
  const mimeType = normalizeUploadMime(input.fileName, input.mimeType);
  validateUploadFile({ type: mimeType, size: input.size });

  if (!isTrustedVercelBlobUrl(input.fileUrl)) {
    throw new UploadValidationError("untrusted_url", "仅允许 Vercel Blob 文件 URL");
  }

  const remoteCheck = await assertRemoteUploadWithinLimits({
    url: input.fileUrl,
    maxBytes: env.UPLOAD_MAX_BYTES,
    allowedMimeTypes: env.ALLOWED_MIME_TYPES,
  });
  if (!remoteCheck.ok) {
    throw new UploadValidationError(remoteCheck.code, remoteCheck.message);
  }

  return createPendingDocumentAndEnqueue(
    ctx,
    { name: input.fileName, mimeType, filePath: input.fileUrl },
    meta,
  );
}

/** 分页列表 + ACL security-trim（D-44） */
export async function listDocuments(ctx: DocumentsContext, params: ListDocumentsParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);
  const jobRepo = ds.getRepository(IngestJobEntity);

  const accessCtx = await resolveDocumentAccessContext(ctx.userId, ctx.workspaceId);
  if (!accessCtx) {
    return { items: [], page, limit, total: 0 };
  }

  const qb = docRepo.createQueryBuilder("doc").where("doc.workspace_id = :workspaceId", {
    workspaceId: ctx.workspaceId,
  });
  const visibility = documentVisibilitySql(accessCtx);
  qb.andWhere(visibility.clause, visibility.params);

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
  // Defense in depth — SQL filter should already match canReadDocument.
  const visible = documents.filter((doc) => canReadDocument(doc, accessCtx));

  const docIds = visible.map((d) => d.id);
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
    items: visible.map((doc) => serializeDocumentRow(doc, latestJobByDoc.get(doc.id) ?? null)),
    page,
    limit,
    total,
  };
}

export async function getDocumentById(
  documentId: string,
  ctx: DocumentsContext,
): Promise<DocumentWithJob | null> {
  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);
  const jobRepo = ds.getRepository(IngestJobEntity);

  const document = await docRepo.findOne({
    where: { id: documentId, workspaceId: ctx.workspaceId },
  });
  if (!document) return null;

  const accessCtx = await resolveDocumentAccessContext(ctx.userId, ctx.workspaceId);
  if (!accessCtx || !canReadDocument(document, accessCtx)) return null;

  const job = await jobRepo.findOne({
    where: { documentId: document.id },
    order: { createdAt: "DESC" },
  });

  return { document, job: job ?? null };
}

export async function updateDocumentMetadata(
  documentId: string,
  ctx: DocumentsContext,
  patch: { title?: string; category?: string | null; tags?: string[] },
): Promise<DocumentEntity | null> {
  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);

  const document = await docRepo.findOne({
    where: { id: documentId, workspaceId: ctx.workspaceId },
  });
  if (!document) return null;

  const accessCtx = await resolveDocumentAccessContext(ctx.userId, ctx.workspaceId);
  if (!accessCtx || !canWriteDocument(document, accessCtx)) return null;

  const next: {
    title?: string;
    category?: string | null;
    tags?: string[];
  } = {};
  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (trimmed) {
      next.title = trimmed;
      document.title = trimmed;
    }
  }
  if (patch.category !== undefined) {
    next.category = patch.category;
    document.category = patch.category;
  }
  if (patch.tags !== undefined) {
    next.tags = patch.tags;
    document.tags = patch.tags;
  }

  if (Object.keys(next).length > 0) {
    await docRepo.update({ id: documentId, workspaceId: ctx.workspaceId }, next);
  }
  return document;
}

async function purgeGraphAndCatalog(workspaceId: string, documentId: string): Promise<void> {
  const ds = await getDataSource();
  const store = createEntityCatalogStore(ds);
  await deleteGraphForDocument(workspaceId, documentId);
  await deleteCatalogForDocument(workspaceId, documentId, store);
}

/**
 * 删除文档（INGEST-04 / Pitfall 5）：
 * 先删 Astra 向量 → 再删本地文件 → 最后删 PG 行。
 */
export async function deleteDocument(documentId: string, ctx: DocumentsContext): Promise<boolean> {
  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);

  const document = await docRepo.findOne({
    where: { id: documentId, workspaceId: ctx.workspaceId },
  });
  if (!document) return false;

  const accessCtx = await resolveDocumentAccessContext(ctx.userId, ctx.workspaceId);
  if (!accessCtx || !canWriteDocument(document, accessCtx)) return false;

  const errors: Error[] = [];
  const tasks: Promise<void>[] = [];

  tasks.push(
    purgeGraphAndCatalog(ctx.workspaceId, documentId).catch((err) => {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }),
  );

  if (shouldWriteAstra()) {
    tasks.push(
      createVectorStore({ corpus: "user" })
        .deleteByDocument(ctx.workspaceId, documentId)
        .catch((err) => {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }),
    );
  }
  if (shouldWriteMilvus()) {
    tasks.push(
      createMilvusVectorStore({ corpus: "user" })
        .deleteByDocument(ctx.workspaceId, documentId)
        .catch((err) => {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }),
    );
  }

  await Promise.all(tasks);

  if (isEsConfigured()) {
    try {
      await deleteByDocumentId(resolveCorpusTargets("user").esIndex, ctx.workspaceId, documentId);
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  if (document.filePath) {
    try {
      await deleteDocumentStorage(document.filePath);
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  if (errors.length > 0) {
    // 未入库 / 入库失败且无向量：次级存储可能为空或不可达，不阻断删除
    const allowDropWithoutChunks =
      document.chunkCount === 0 &&
      (document.status === "pending" ||
        document.status === "failed" ||
        document.status === "processing");
    if (!allowDropWithoutChunks) {
      throw new AggregateError(errors, `deleteDocument failed for ${documentId}`);
    }
  }

  await docRepo.delete({ id: documentId, workspaceId: ctx.workspaceId });
  return true;
}

/** Delete local / Blob / MinIO object for a document filePath. */
export async function deleteDocumentStorage(filePath: string): Promise<void> {
  if (filePath.startsWith("s3://")) {
    await deleteStoredObject(filePath);
    return;
  }
  if (isTrustedVercelBlobUrl(filePath) && isVercelBlobConfigured()) {
    const { del } = await import("@vercel/blob");
    await del(filePath, { token: process.env.BLOB_READ_WRITE_TOKEN });
    return;
  }
  try {
    await fs.unlink(filePath);
  } catch {
    // missing local file is fine
  }
}

/** 重新索引（INGEST-05 / D-21）：processing + 新 job + 同路径入队，无确认 */
export async function reindexDocument(
  documentId: string,
  ctx: DocumentsContext,
): Promise<{ document: DocumentEntity; job: IngestJobEntity } | null> {
  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocumentEntity);

  const document = await docRepo.findOne({
    where: { id: documentId, workspaceId: ctx.workspaceId },
  });
  if (!document?.filePath || !document.mimeType) return null;

  const accessCtx = await resolveDocumentAccessContext(ctx.userId, ctx.workspaceId);
  if (!accessCtx || !canWriteDocument(document, accessCtx)) return null;
  if (document.status === "processing") {
    throw new ReindexBusyError();
  }

  // Do not purge vectors/graph before upsert — parse/embed failure must keep prior ready index.
  await docRepo.update(
    { id: documentId, workspaceId: ctx.workspaceId },
    { status: "processing", chunkCount: 0 },
  );
  document.status = "processing";
  document.chunkCount = 0;

  const payload: IngestJobPayload = {
    workspaceId: ctx.workspaceId,
    documentId: document.id,
    filePath: document.filePath,
    mimeType: document.mimeType,
    title: document.title,
    category: document.category ?? undefined,
    tags: document.tags,
    preserveExistingVectors: true,
  };

  const job = await enqueueIngestJob(document, payload, ctx.workspaceId);
  return { document, job };
}

/** 按 ingest_job id 查 job（SSE 鉴权：必须属于 default workspace） */
export { getIngestJobForContext } from "./ingest-jobs.service";

export { parseTagsParam };
