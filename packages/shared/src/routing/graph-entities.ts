/**
 * Phase 3 demo graph seed entities — single source of truth for L0/L1/resolveProductName.
 * Production graph layer is narrow-domain until workspace entity registry exists.
 */

export const SEED_GRAPH_ENTITY_RES = [/珍珠奶茶/, /pearl\s*milk\s*tea/i] as const;

/** Whether the query mentions a seeded graph entity (demo subgraph). */
export function hasSeedGraphEntity(query: string): boolean {
  return SEED_GRAPH_ENTITY_RES.some((re) => re.test(query));
}

/** Product node name for seeded subgraph when entity matches. */
export function resolveSeedProductName(query: string): string | null {
  return hasSeedGraphEntity(query) ? "珍珠奶茶" : null;
}
