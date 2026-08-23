/** Idempotent Neo4j constraints/indexes for ingest graph (D-12, D-02). */
export const NEO4J_GRAPH_CONSTRAINT_STATEMENTS = [
  `CREATE CONSTRAINT entity_ws_key IF NOT EXISTS
   FOR (e:Entity) REQUIRE (e.workspaceId, e.normalizedName, e.entityType) IS UNIQUE`,
  `CREATE CONSTRAINT document_id IF NOT EXISTS
   FOR (d:Document) REQUIRE d.id IS UNIQUE`,
  `CREATE RANGE INDEX entity_workspace IF NOT EXISTS FOR (e:Entity) ON (e.workspaceId)`,
] as const;

let constraintsEnsured = false;

export async function ensureNeo4jGraphConstraints(
  runStatement: (statement: string) => Promise<void>,
): Promise<void> {
  if (constraintsEnsured) return;
  for (const statement of NEO4J_GRAPH_CONSTRAINT_STATEMENTS) {
    await runStatement(statement);
  }
  constraintsEnsured = true;
}

/** Test helper: reset once-per-process constraint guard. */
export function resetNeo4jGraphConstraintsForTests(): void {
  constraintsEnsured = false;
}
