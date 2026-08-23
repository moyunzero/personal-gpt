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

function extractMatchSegment(stmtBody: string): string {
  const upper = stmtBody.toUpperCase();
  const matchStart = upper.indexOf("MATCH");
  if (matchStart < 0) return "";
  let end = stmtBody.length;
  for (const keyword of [" WHERE ", " WITH ", " UNWIND ", " CALL ", " RETURN "]) {
    const idx = upper.indexOf(keyword, matchStart + 5);
    if (idx >= 0) end = Math.min(end, idx);
  }
  return stmtBody.slice(matchStart, end);
}

function extractNodePatterns(segment: string): string[] {
  const patterns: string[] = [];
  for (let i = 0; i < segment.length; i++) {
    if (segment[i] !== "(") continue;
    let depth = 0;
    let j = i;
    for (; j < segment.length; j++) {
      const ch = segment[j]!;
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth === 0) patterns.push(segment.slice(i, j + 1));
    i = j;
  }
  return patterns;
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

  const matchSegment = extractMatchSegment(stmtBody);
  const nodeLabels: string[] = [];
  for (const pattern of extractNodePatterns(matchSegment)) {
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
