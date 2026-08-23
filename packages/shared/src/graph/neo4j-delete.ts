import neo4j, { type Driver } from "neo4j-driver";

import { getNeo4jDriverFromEnv } from "../rag/graph-rag";

/**
 * Remove Document subgraph and orphan Entity nodes for one ingest document (GRAPH-04, D-02).
 * Ingest-only write path — does not use assertAllowlistedCypher.
 * Seed nodes not linked via the deleted Document are untouched (D-05).
 */
export async function deleteGraphForDocument(
  workspaceId: string,
  documentId: string,
  driver: Driver = getNeo4jDriverFromEnv(),
): Promise<void> {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        MATCH (d:Document {id: $documentId, workspaceId: $workspaceId})
        OPTIONAL MATCH (d)-[:MENTIONS]->(e:Entity)
        WITH d, collect(DISTINCT e) AS entities
        DETACH DELETE d
        WITH entities
        UNWIND entities AS e
        OPTIONAL MATCH (other:Document)-[:MENTIONS]->(e)
        WITH e, count(other) AS refs
        WHERE e IS NOT NULL AND refs = 0
        DETACH DELETE e
        `,
        { documentId, workspaceId },
      );
    });
  } finally {
    await session.close();
  }
}
