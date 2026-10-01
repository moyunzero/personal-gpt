import type { DocumentAccessContext } from "@/lib/auth/document-acl";

/**
 * SQL fragment + params for document visibility before pagination.
 * Mirrors canReadDocument: workspace | private(owner) | restricted(owner or allowlist).
 */
export function documentVisibilitySql(accessCtx: DocumentAccessContext): {
  clause: string;
  params: Record<string, string>;
} {
  return {
    clause: `(
      doc.visibility = 'workspace'
      OR (doc.visibility = 'private' AND doc.owner_id = :aclUserId)
      OR (
        doc.visibility = 'restricted'
        AND (
          doc.owner_id = :aclUserId
          OR doc.restricted_user_ids @> CAST(:aclUserJson AS jsonb)
        )
      )
    )`,
    params: {
      aclUserId: accessCtx.userId,
      aclUserJson: JSON.stringify([accessCtx.userId]),
    },
  };
}
