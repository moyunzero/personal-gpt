import type { AppAuthSession } from "@/lib/auth/session";
import { getActiveWorkspaceId, getSessionUserId } from "@/lib/auth/session";
import { resolveAllowedDocumentIds } from "@/lib/auth/workspace.service";

export type RetrievalContext = {
  userId: string;
  workspaceId: string;
  allowedDocumentIds: string[];
};

/** Build tenant-scoped retrieval context from session (D-20). */
export async function resolveRetrievalContext(session: AppAuthSession): Promise<RetrievalContext> {
  const userId = getSessionUserId(session);
  const workspaceId = await getActiveWorkspaceId(session);
  const allowedDocumentIds = await resolveAllowedDocumentIds(userId, workspaceId);
  return { userId, workspaceId, allowedDocumentIds };
}

/** Forward headers for agent-service network boundary (D-20). */
export function retrievalContextHeaders(ctx: RetrievalContext): Record<string, string> {
  return {
    "x-user-id": ctx.userId,
    "x-workspace-id": ctx.workspaceId,
    "x-allowed-document-ids": ctx.allowedDocumentIds.join(","),
  };
}
