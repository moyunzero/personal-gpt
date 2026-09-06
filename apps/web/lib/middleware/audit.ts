import { getDataSource } from "@/lib/db/get-data-source";
import { AuditLogEntity } from "@/lib/db/entities/audit-log.entity";
import { logger } from "@/lib/logger";

export type AuditLogInput = {
  method: string;
  path: string;
  userId?: string | null;
  workspaceId?: string | null;
  statusCode: number;
  latencyMs: number;
  requestId?: string | null;
};

const SENSITIVE_KEYS = new Set(["content", "body", "messages", "document", "file", "raw", "text"]);

/** Strip document/message payloads — audit metadata only (D-37, T-04-06-03). */
export function sanitizeAuditResource(path: string): string {
  return path.split("?")[0] ?? path;
}

export function auditActionFromRequest(method: string, path: string): string {
  return `${method.toUpperCase()} ${sanitizeAuditResource(path)}`;
}

export function shouldRedactAuditField(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/** Persist one HTTP audit row (D-36/D-37). Fail-open on DB errors. */
export async function writeAuditLog(input: AuditLogInput): Promise<AuditLogEntity | null> {
  try {
    const ds = await getDataSource();
    const repo = ds.getRepository(AuditLogEntity);
    const row = repo.create({
      action: auditActionFromRequest(input.method, input.path),
      resource: sanitizeAuditResource(input.path),
      userId: input.userId ?? null,
      workspaceId: input.workspaceId ?? null,
      statusCode: input.statusCode,
      latencyMs: input.latencyMs,
      requestId: input.requestId ?? null,
    });
    return await repo.save(row);
  } catch (err) {
    logger.child({ scope: "audit" }).error("audit log write failed (fail-open)", { err });
    return null;
  }
}

export async function finalizeApiAudit(
  startedAt: number,
  input: Omit<AuditLogInput, "latencyMs" | "statusCode"> & { statusCode: number },
): Promise<void> {
  await writeAuditLog({
    ...input,
    latencyMs: Math.max(0, Date.now() - startedAt),
  });
}
