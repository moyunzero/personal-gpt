import neo4j, { type Driver } from "neo4j-driver";

import { getNeo4jDriverFromEnv } from "../rag/graph-rag";
import type { ExtractedEntity, ExtractedRelation } from "./extract-entities";
import { ensureNeo4jGraphConstraints } from "./neo4j-constraints";

export type UpsertDocumentGraphParams = {
  workspaceId: string;
  documentId: string;
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
};

export function stableEntityId(
  workspaceId: string,
  normalizedName: string,
  entityType: string,
): string {
  return `entity:${workspaceId}:${normalizedName}:${entityType}`;
}

const INTER_ENTITY_REL_TYPES = ["RELATED_TO", "CONTAINS", "USES"] as const;

function entityRow(workspaceId: string, entity: ExtractedEntity) {
  return {
    name: entity.name,
    normalizedName: entity.normalizedName,
    entityType: entity.entityType,
    id: stableEntityId(workspaceId, entity.normalizedName, entity.entityType),
    workspaceId,
  };
}

async function runConstraintsWithDriver(driver: Driver): Promise<void> {
  await ensureNeo4jGraphConstraints(async (statement) => {
    const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite(async (tx) => {
        await tx.run(statement);
      });
    } finally {
      await session.close();
    }
  });
}

/** Idempotent constraint bootstrap using ingest write session (no allowlist). */
export async function ensureNeo4jGraphConstraintsFromEnv(
  driver: Driver = getNeo4jDriverFromEnv(),
): Promise<void> {
  await runConstraintsWithDriver(driver);
}

/**
 * Upsert Document + Entity subgraph for one ingest document (D-02, D-12).
 * Ingest-only write path — does not use assertAllowlistedCypher.
 */
export async function upsertDocumentGraph(
  params: UpsertDocumentGraphParams,
  driver: Driver = getNeo4jDriverFromEnv(),
): Promise<void> {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  const entityRows = params.entities.map((entity) => entityRow(params.workspaceId, entity));

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        MERGE (d:Document {id: $documentId})
        SET d.workspaceId = $workspaceId
        `,
        { documentId: params.documentId, workspaceId: params.workspaceId },
      );

      if (entityRows.length > 0) {
        await tx.run(
          `
          MATCH (d:Document {id: $documentId, workspaceId: $workspaceId})
          UNWIND $entities AS ent
          MERGE (e:Entity {workspaceId: ent.workspaceId, normalizedName: ent.normalizedName, entityType: ent.entityType})
          SET e.name = ent.name, e.id = ent.id
          MERGE (d)-[:MENTIONS]->(e)
          `,
          {
            documentId: params.documentId,
            workspaceId: params.workspaceId,
            entities: entityRows,
          },
        );
      }

      for (const relType of INTER_ENTITY_REL_TYPES) {
        const typedRows = params.relations
          .filter((rel) => rel.type === relType)
          .map((rel) => ({
            fromNormalizedName: rel.fromNormalizedName,
            toNormalizedName: rel.toNormalizedName,
          }));
        if (typedRows.length === 0) continue;

        await tx.run(
          `
          MATCH (d:Document {id: $documentId, workspaceId: $workspaceId})
          UNWIND $relations AS rel
          MATCH (from:Entity {workspaceId: $workspaceId, normalizedName: rel.fromNormalizedName})
          MATCH (to:Entity {workspaceId: $workspaceId, normalizedName: rel.toNormalizedName})
          MERGE (from)-[:${relType}]->(to)
          `,
          {
            documentId: params.documentId,
            workspaceId: params.workspaceId,
            relations: typedRows,
          },
        );
      }
    });
  } finally {
    await session.close();
  }
}

export {
  ensureNeo4jGraphConstraints,
  resetNeo4jGraphConstraintsForTests,
} from "./neo4j-constraints";
