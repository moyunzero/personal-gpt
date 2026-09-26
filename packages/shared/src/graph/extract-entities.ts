import { generateObject, generateText } from "ai";

import { presetForModel } from "../ai/model-presets";
import {
  graphLanguageModel,
  resolveChatProviderConfig,
  resolveRagHelperModel,
  type GraphModelEndpoint,
} from "../ai/chat-provider";
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
Use exact entity names as they appear in the text.
JSON shape: {"entities":[{"name":"string","entityType":"person"}],"relations":[{"fromName":"string","toName":"string","type":"RELATED_TO"}]}`;

export type { GraphModelEndpoint };

/** 工作区里当前选中的模型。缺 id、密钥或地址时不用。 */
export function workspaceGraphEndpoint(
  row:
    | {
        model_id?: string | null;
        api_key?: string | null;
        base_url?: string | null;
      }
    | null
    | undefined,
): GraphModelEndpoint | undefined {
  const modelId = row?.model_id?.trim() ?? "";
  const apiKey = row?.api_key?.trim() ?? "";
  const baseURL = row?.base_url?.trim() || (modelId ? presetForModel(modelId)?.baseURL : "") || "";
  if (!modelId || !apiKey || !baseURL) return undefined;
  return { modelId, baseURL, apiKey, name: "workspace" };
}

function endpointOrEnv(endpoint?: GraphModelEndpoint): GraphModelEndpoint {
  if (endpoint?.modelId && endpoint.baseURL && endpoint.apiKey) return endpoint;
  const cfg = resolveChatProviderConfig();
  return {
    modelId: resolveRagHelperModel(),
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey,
    name: cfg.name,
  };
}

/** 从模型正文里取出第一个 JSON 对象，允许 Markdown 代码块。 */
export function parseGraphJsonText(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("No object generated: response did not match schema.");
  }
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

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

function toGraph(object: {
  entities: { name: string; entityType: EntityType }[];
  relations: { fromName: string; toName: string; type: RelationType }[];
}): { entities: ExtractedEntity[]; relations: ExtractedRelation[] } {
  return {
    entities: object.entities.map((entity) => ({
      name: entity.name,
      normalizedName: normalizeEntityName(entity.name),
      entityType: entity.entityType,
    })),
    relations: object.relations.map(toExtractedRelation),
  };
}

async function extractWithJsonText(
  chunkText: string,
  endpoint: GraphModelEndpoint,
): Promise<{ entities: ExtractedEntity[]; relations: ExtractedRelation[] }> {
  const { text } = await generateText({
    model: graphLanguageModel(endpoint, false),
    system: EXTRACT_SYSTEM,
    prompt: chunkText,
    temperature: 0,
  });
  const parsed = ChunkGraphSchema.safeParse(parseGraphJsonText(text));
  if (!parsed.success) {
    throw new Error("No object generated: response did not match schema.");
  }
  return toGraph(parsed.data);
}

/**
 * 先把 JSON schema 发给模型。该模型不支持或对不上结构时，再要一份 JSON 并在本地校验。
 * endpoint 是用户在设置里选的模型；缺省时用环境里的辅助模型。
 */
export async function extractGraphFromChunk(
  chunkText: string,
  endpoint?: GraphModelEndpoint,
): Promise<{ entities: ExtractedEntity[]; relations: ExtractedRelation[] }> {
  const target = endpointOrEnv(endpoint);
  try {
    const { object } = await generateObject({
      model: graphLanguageModel(target, true),
      schema: ChunkGraphSchema,
      system: EXTRACT_SYSTEM,
      prompt: chunkText,
      temperature: 0,
    });
    return toGraph(object);
  } catch (error) {
    try {
      return await extractWithJsonText(chunkText, target);
    } catch {
      throw error;
    }
  }
}

/** Full per-chunk coverage with workspace-scoped entity dedupe (D-10, D-12). */
export async function extractGraphFromChunks(
  chunks: string[],
  endpoint?: GraphModelEndpoint,
): Promise<{ entities: ExtractedEntity[]; relations: ExtractedRelation[] }> {
  const entityMap = new Map<string, ExtractedEntity>();
  const relations: ExtractedRelation[] = [];
  const relationKeys = new Set<string>();

  for (const chunkText of chunks) {
    const chunkGraph = await extractGraphFromChunk(chunkText, endpoint);
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
