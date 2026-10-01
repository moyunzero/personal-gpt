/** Reject "restricted" with empty allowlist — that is a false authorization state. */
export function assertRestrictedAllowlist(ids: string[] | undefined | null): string[] {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("restricted visibility requires at least one restrictedUserIds entry");
  }
  return ids;
}
