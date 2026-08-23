import type { AppAuthSession } from "@/lib/auth/session";
import { getActiveWorkspaceId, getSessionUserId } from "@/lib/auth/session";
import type { DocumentsContext } from "@/lib/kb/documents.service";

export function documentsContextFromSession(session: AppAuthSession): DocumentsContext {
  return {
    userId: getSessionUserId(session),
    workspaceId: getActiveWorkspaceId(session),
  };
}
