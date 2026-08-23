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
  const normalized = cypher
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .trim();
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
  // Disallow multiple statements (strip one optional trailing semicolon first)
  let stmtBody = normalized;
  if (stmtBody.endsWith(";")) {
    stmtBody = stmtBody.slice(0, -1).trimEnd();
  }
  if (stmtBody.includes(";")) {
    throw new CypherAllowlistError("Cypher rejected: multiple statements not allowed");
  }

  const allowedLabels = new Set<string>(ALLOWED_LABELS);
  const allowedRels = new Set<string>(ALLOWED_REL_TYPES);

  const matchClause = stmtBody.split(/\bRETURN\b/i)[0] ?? stmtBody;
  const nodeLabels: string[] = [];
  const nodePatternRe = /\([^)]*\)/g;
  let patternMatch: RegExpExecArray | null;
  while ((patternMatch = nodePatternRe.exec(matchClause)) !== null) {
    const pattern = patternMatch[0]!;
    const labels = [...pattern.matchAll(/:([A-Za-z]\w*)/g)].map((m) => m[1]!);
    if (labels.length === 0) {
      throw new CypherAllowlistError("Cypher rejected: unlabeled node pattern in MATCH");
    }
    nodeLabels.push(...labels);
  }
  if (nodeLabels.length === 0) {
    throw new CypherAllowlistError("Cypher rejected: no allowlisted node labels in MATCH");
  }
  for (const label of nodeLabels) {
    if (!allowedLabels.has(label)) {
      throw new CypherAllowlistError(`Cypher rejected: node label not allowlisted: ${label}`);
    }
  }

  const relPatterns = normalized.match(/-\[[^\]]*\]-?>?/g) ?? [];
  for (const relPattern of relPatterns) {
    const bracketMatch = relPattern.match(/\[([^\]]*)\]/);
    if (!bracketMatch) continue;
    const inner = bracketMatch[1]!.trim();
    if (inner.includes("*")) {
      throw new CypherAllowlistError(
        "Cypher rejected: variable-length relationship not allowlisted",
      );
    }
    if (!inner.includes(":")) {
      throw new CypherAllowlistError("Cypher rejected: untyped relationship pattern");
    }
    if (inner.includes("|")) {
      throw new CypherAllowlistError("Cypher rejected: multi-type relationship not allowlisted");
    }
    const types = [...inner.matchAll(/:([A-Za-z]\w*)/g)].map((m) => m[1]!);
    if (types.length !== 1) {
      throw new CypherAllowlistError(
        "Cypher rejected: relationship pattern must contain exactly one type",
      );
    }
    if (!allowedRels.has(types[0]!)) {
      throw new CypherAllowlistError(
        `Cypher rejected: relationship type not allowlisted: ${types[0]}`,
      );
    }
  }
}
