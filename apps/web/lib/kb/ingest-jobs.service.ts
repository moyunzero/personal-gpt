import { canReadDocument } from "@/lib/auth/document-acl";
import { resolveDocumentAccessContext } from "@/lib/auth/workspace.service";
import { DocumentEntity } from "@/lib/db/entities/document.entity";
import { IngestJobEntity } from "@/lib/db/entities/ingest-job.entity";
import { getDataSource } from "@/lib/db/get-data-source";
import type { DocumentsContext } from "@/lib/kb/documents.service";

/** 按 id + session workspace 查询 ingest job，并校验文档可读（防枚举 / 跨租户） */
export async function getIngestJobForContext(
  jobId: string,
  ctx: DocumentsContext,
): Promise<IngestJobEntity | null> {
  const ds = await getDataSource();
  const job = await ds.getRepository(IngestJobEntity).findOne({
    where: { id: jobId, workspaceId: ctx.workspaceId },
  });
  if (!job) return null;

  const document = await ds.getRepository(DocumentEntity).findOne({
    where: { id: job.documentId, workspaceId: ctx.workspaceId },
  });
  if (!document) return null;

  const accessCtx = await resolveDocumentAccessContext(ctx.userId, ctx.workspaceId);
  if (!accessCtx || !canReadDocument(document, accessCtx)) return null;

  return job;
}
