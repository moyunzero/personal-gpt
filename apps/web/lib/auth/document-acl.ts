import type { DocumentEntity, DocumentVisibility } from "@/lib/db/entities/document.entity";
import type { WorkspaceRole } from "@/lib/db/entities/workspace-member.entity";

export type DocumentAccessContext = {
  userId: string;
  memberRole: WorkspaceRole;
};

export function canReadDocument(doc: DocumentEntity, ctx: DocumentAccessContext): boolean {
  if (doc.visibility === "workspace") return true;
  if (doc.visibility === "private") {
    return doc.ownerId === ctx.userId;
  }
  if (doc.visibility === "restricted") {
    if (doc.ownerId === ctx.userId) return true;
    return doc.restrictedUserIds.includes(ctx.userId);
  }
  return false;
}

/** Write (delete/update/reindex): document owner, or workspace owner/editor. Viewers never write. */
export function canWriteDocument(doc: DocumentEntity, ctx: DocumentAccessContext): boolean {
  if (doc.ownerId != null && doc.ownerId === ctx.userId) return true;
  return ctx.memberRole === "owner" || ctx.memberRole === "editor";
}

export function canManageDocumentAcl(
  doc: DocumentEntity,
  ctx: DocumentAccessContext & { workspaceOwner: boolean },
): boolean {
  if (doc.ownerId === ctx.userId) return true;
  return ctx.workspaceOwner;
}

export function defaultDocumentVisibility(): DocumentVisibility {
  return "workspace";
}
