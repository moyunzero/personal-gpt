/**
 * BFF ACL headers → agent RetrievalContext (D-20).
 * Mirrors apps/web/lib/auth/acl-resolver.ts header contract.
 */

export type RetrievalContext = {
  userId: string;
  workspaceId: string;
  allowedDocumentIds: string[];
};

export type RetrievalHeaderInput = {
  "x-user-id"?: string | undefined;
  "x-workspace-id"?: string | undefined;
  "x-allowed-document-ids"?: string | undefined;
};

function parseAllowedDocumentIds(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** Parse BFF x-* headers; empty x-allowed-document-ids → []. */
export function parseRetrievalContextFromHeaders(
  headers: RetrievalHeaderInput,
  fallback?: { workspaceId?: string; userId?: string },
): RetrievalContext {
  const userId =
    (typeof headers["x-user-id"] === "string" && headers["x-user-id"].trim()
      ? headers["x-user-id"].trim()
      : undefined) ?? (fallback?.userId?.trim() ? fallback.userId.trim() : "anonymous");

  const headerWorkspace =
    typeof headers["x-workspace-id"] === "string" && headers["x-workspace-id"].trim()
      ? headers["x-workspace-id"].trim()
      : undefined;
  const workspaceId = headerWorkspace ?? (fallback?.workspaceId?.trim() || "default");

  const allowedDocumentIds = parseAllowedDocumentIds(headers["x-allowed-document-ids"]);

  return { userId, workspaceId, allowedDocumentIds };
}
