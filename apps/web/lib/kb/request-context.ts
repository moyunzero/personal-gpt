import type { AppAuthSession } from "@/lib/auth/session";
import { getActiveWorkspaceId, getSessionUserId } from "@/lib/auth/session";
import type { DocumentsContext } from "@/lib/kb/documents.service";

export async function documentsContextFromSession(
  session: AppAuthSession,
): Promise<DocumentsContext> {
  return {
    userId: getSessionUserId(session),
    workspaceId: await getActiveWorkspaceId(session),
  };
}
