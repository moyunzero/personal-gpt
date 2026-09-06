import { generateObject } from "ai";

import { chatModel, resolveRagHelperModel } from "../ai/chat-provider";
import { ChunkGraphSchema, type EntityType, type RelationType } from "./extract-schema";
import { normalizeEntityName } from "./normalize-entity";

export type ExtractedEntity = {
  name: string;
  normalizedName: string;
  entityType: EntityType;
};

export type ExtractedRelation = {
  fromName: string;
  toName: string;
  fromNormalizedName: string;
  toNormalizedName: string;
  type: RelationType;
};

const EXTRACT_SYSTEM = `Extract named entities and relationships from a document chunk.
Return JSON only. entityType must be one of: person, org, product, concept, location, other.
Relation type must be one of: MENTIONS, RELATED_TO, CONTAINS, USES.
Use exact entity names as they appear in the text.`;

function entityKey(normalizedName: string, entityType: EntityType): string {
  return `${normalizedName}|${entityType}`;
}

function toExtractedRelation(rel: {
  fromName: string;
  toName: string;
  type: RelationType;
}): ExtractedRelation {
  return {
    fromName: rel.fromName,
    toName: rel.toName,
    fromNormalizedName: normalizeEntityName(rel.fromName),
    toNormalizedName: normalizeEntityName(rel.toName),
    type: rel.type,
  };
}

/** Per-chunk LLM structured extract (D-08, D-10). Throws on schema/LLM errors. */
export async function extractGraphFromChunk(
  chunkText: string,
): Promise<{ entities: ExtractedEntity[]; relations: ExtractedRelation[] }> {
  const { object } = await generateObject({
    model: chatModel(resolveRagHelperModel()),
    schema: ChunkGraphSchema,
    system: EXTRACT_SYSTEM,
    prompt: chunkText,
    temperature: 0,
  });

  return {
    entities: object.entities.map((entity) => ({
      name: entity.name,
      normalizedName: normalizeEntityName(entity.name),
      entityType: entity.entityType,
    })),
    relations: object.relations.map(toExtractedRelation),
  };
}

/** Full per-chunk coverage with workspace-scoped entity dedupe (D-10, D-12). */
export async function extractGraphFromChunks(
  chunks: string[],
): Promise<{ entities: ExtractedEntity[]; relations: ExtractedRelation[] }> {
  const entityMap = new Map<string, ExtractedEntity>();
  const relations: ExtractedRelation[] = [];
  const relationKeys = new Set<string>();

  for (const chunkText of chunks) {
    const chunkGraph = await extractGraphFromChunk(chunkText);
    for (const entity of chunkGraph.entities) {
      const key = entityKey(entity.normalizedName, entity.entityType);
      if (!entityMap.has(key)) {
        entityMap.set(key, entity);
      }
    }
    for (const relation of chunkGraph.relations) {
      const relKey = `${relation.fromNormalizedName}|${relation.toNormalizedName}|${relation.type}`;
      if (!relationKeys.has(relKey)) {
        relationKeys.add(relKey);
        relations.push(relation);
      }
    }
  }

  return {
    entities: [...entityMap.values()],
    relations,
  };
}
