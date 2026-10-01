/** Reject "restricted" with empty allowlist — that is a false authorization state. */
export class RestrictedVisibilityError extends Error {
  readonly code = "restricted_allowlist_required" as const;

  constructor(message = "restricted visibility requires at least one restrictedUserIds entry") {
    super(message);
    this.name = "RestrictedVisibilityError";
  }
}

export function assertRestrictedAllowlist(ids: string[] | undefined | null): string[] {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new RestrictedVisibilityError();
  }
  const cleaned = ids.map((id) => String(id).trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new RestrictedVisibilityError();
  }
  return cleaned;
}
