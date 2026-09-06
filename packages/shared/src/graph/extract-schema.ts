import { z } from "zod";

/** D-14: fixed entityType enum for LLM structured output */
export const EntityTypeEnum = z.enum(["person", "org", "product", "concept", "location", "other"]);

/** D-13: fixed relation type set for ingest graph */
export const RelationTypeEnum = z.enum(["MENTIONS", "RELATED_TO", "CONTAINS", "USES"]);

export const ChunkGraphSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string().min(1),
      entityType: EntityTypeEnum,
    }),
  ),
  relations: z.array(
    z.object({
      fromName: z.string().min(1),
      toName: z.string().min(1),
      type: RelationTypeEnum,
    }),
  ),
});

export type EntityType = z.infer<typeof EntityTypeEnum>;
export type RelationType = z.infer<typeof RelationTypeEnum>;
export type ChunkGraph = z.infer<typeof ChunkGraphSchema>;
