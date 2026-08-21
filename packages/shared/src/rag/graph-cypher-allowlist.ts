/**
 * Cypher allowlist for narrow Graph RAG (Pitfall 8 / T-03-cypher).
 * Only MATCH/RETURN-style reads; reject write / admin keywords.
 */

const WRITE_OR_ADMIN =
  /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|LOAD\s+CSV|CALL|FOREACH|CREATE\s+CONSTRAINT|CREATE\s+INDEX|ALTER|GRANT|DENY|REVOKE|USING\s+PERIODIC\s+COMMIT)\b/i;

/** Allowed relationship types in the milk-tea seed subgraph (A5). */
export const ALLOWED_REL_TYPES = ["CONTAINS", "USES", "SUITABLE_FOR", "BELONGS_TO"] as const;

/** Allowed node labels in the milk-tea seed subgraph. */
export const ALLOWED_LABELS = ["Product", "Ingredient", "Method", "People", "Type"] as const;

export class CypherAllowlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CypherAllowlistError";
  }
}

/**
 * Assert Cypher is read-only and structurally safe for Graph RAG.
 * Does not execute; call before any Neo4j session.run.
 */
export function assertAllowlistedCypher(cypher: string): void {
  const normalized = cypher.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").trim();
  if (!normalized) {
    throw new CypherAllowlistError("Cypher is empty");
  }
  if (WRITE_OR_ADMIN.test(normalized)) {
    throw new CypherAllowlistError("Cypher rejected: write/admin keyword not allowlisted");
  }
  if (!/^\s*MATCH\b/i.test(normalized)) {
    throw new CypherAllowlistError("Cypher rejected: must start with MATCH");
  }
  if (!/\bRETURN\b/i.test(normalized)) {
    throw new CypherAllowlistError("Cypher rejected: must include RETURN");
  }
  // Disallow multiple statements
  if (normalized.includes(";") && !/;\s*$/.test(normalized)) {
    throw new CypherAllowlistError("Cypher rejected: multiple statements not allowed");
  }
}
