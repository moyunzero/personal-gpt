/** D-49: exact normalization for ingest entity keys (trim, lowercase, collapse whitespace). */
export function normalizeEntityName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
