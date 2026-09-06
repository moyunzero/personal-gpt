/**
 * Named Cypher templates for Graph RAG (GRAPH-03 / D-04).
 * Each template is allowlisted and workspace-scoped for user graph reads.
 */

import type { ResolvedGraphEntity } from "../routing/entity-resolve";

export type GraphCypherTemplateId = "seed_product_path" | "entity_rel_path" | "doc_entity_mentions";

export type GraphCypherTemplate = {
  id: GraphCypherTemplateId;
  cypher: string;
  buildParams: (
    resolvedEntity: ResolvedGraphEntity,
    workspaceId: string,
  ) => Record<string, unknown>;
};

/** Canonical path query for milk-tea seed: Product → Ingredient → Method */
export const MILK_TEA_PATH_CYPHER = `
MATCH path = (p:Product {name: $productName})-[:CONTAINS]->(i:Ingredient)-[:USES]->(m:Method)
RETURN path
`.trim();

export const ENTITY_REL_PATH_CYPHER = `
MATCH path = (e:Entity {workspaceId: $workspaceId})-[:RELATED_TO|CONTAINS|USES*1..2]-(n:Entity|Concept|Document)
WHERE e.normalizedName = $normalizedName AND e.entityType = $entityType
RETURN path
`.trim();

export const DOC_ENTITY_MENTIONS_CYPHER = `
MATCH path = (d:Document {workspaceId: $workspaceId})-[:MENTIONS]->(e:Entity)
WHERE e.workspaceId = $workspaceId AND e.normalizedName = $normalizedName AND e.entityType = $entityType
RETURN path
`.trim();

export const GRAPH_CYPHER_TEMPLATES: Record<GraphCypherTemplateId, GraphCypherTemplate> = {
  seed_product_path: {
    id: "seed_product_path",
    cypher: MILK_TEA_PATH_CYPHER,
    buildParams: (resolvedEntity) => ({
      productName: resolvedEntity.displayName,
    }),
  },
  entity_rel_path: {
    id: "entity_rel_path",
    cypher: ENTITY_REL_PATH_CYPHER,
    buildParams: (resolvedEntity, workspaceId) => ({
      workspaceId,
      normalizedName: resolvedEntity.normalizedName,
      entityType: resolvedEntity.entityType ?? "other",
    }),
  },
  doc_entity_mentions: {
    id: "doc_entity_mentions",
    cypher: DOC_ENTITY_MENTIONS_CYPHER,
    buildParams: (resolvedEntity, workspaceId) => ({
      workspaceId,
      normalizedName: resolvedEntity.normalizedName,
      entityType: resolvedEntity.entityType ?? "other",
    }),
  },
};

export function selectTemplateForEntity(
  resolvedEntity: ResolvedGraphEntity,
  templateIdOverride?: GraphCypherTemplateId,
): GraphCypherTemplate {
  if (templateIdOverride) {
    return GRAPH_CYPHER_TEMPLATES[templateIdOverride];
  }
  if (resolvedEntity.source === "seed") {
    return GRAPH_CYPHER_TEMPLATES.seed_product_path;
  }
  return GRAPH_CYPHER_TEMPLATES.entity_rel_path;
}
