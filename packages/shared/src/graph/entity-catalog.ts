import type { EntityType } from "./extract-schema";
import type { ExtractedEntity } from "./extract-entities";
import { normalizeEntityName } from "./normalize-entity";
import { stableEntityId } from "./neo4j-upsert";

export type EntityCatalogRecord = {
  id: string;
  workspaceId: string;
  normalizedName: string;
  entityType: EntityType;
  displayName: string;
  neo4jNodeId: string;
  sourceDocumentId: string;
};

export type EntityCatalogStore = {
  findByWorkspace(workspaceId: string): Promise<EntityCatalogRecord[]>;
  findByDocument(workspaceId: string, documentId: string): Promise<EntityCatalogRecord[]>;
  upsert(row: Omit<EntityCatalogRecord, "id"> & { id?: string }): Promise<EntityCatalogRecord>;
  deleteByDocument(workspaceId: string, documentId: string): Promise<number>;
  ensureWorkspaceReadAcl(workspaceId: string, entityCatalogId: string): Promise<void>;
};

export type UpsertCatalogEntriesParams = {
  workspaceId: string;
  documentId: string;
  entities: ExtractedEntity[];
};

function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/[\s,，。！？!?；;：:]+/)
    .map((token) => token.replace(/^[\s!！?？。,，~]+|[\s!！?？。,，~]+$/g, ""))
    .filter(Boolean);
}

function queryContainsNormalizedName(query: string, normalizedName: string): boolean {
  const normalizedQuery = normalizeEntityName(query);
  if (normalizedQuery.includes(normalizedName)) return true;

  const tokens = tokenizeQuery(query);
  if (tokens.some((token) => token === normalizedName)) return true;

  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const compactName = normalizedName.replace(/\s+/g, "");
  return compactName.length > 0 && compactQuery.includes(compactName);
}

/** Upsert PG catalog rows for extracted entities (D-48, D-49). */
export async function upsertCatalogEntries(
  params: UpsertCatalogEntriesParams,
  store: EntityCatalogStore,
): Promise<void> {
  const { workspaceId, documentId, entities } = params;
  const deduped = new Map<string, ExtractedEntity>();
  for (const entity of entities) {
    deduped.set(`${entity.normalizedName}|${entity.entityType}`, entity);
  }

  for (const entity of deduped.values()) {
    const saved = await store.upsert({
      workspaceId,
      normalizedName: entity.normalizedName,
      entityType: entity.entityType,
      displayName: entity.name,
      neo4jNodeId: stableEntityId(workspaceId, entity.normalizedName, entity.entityType),
      sourceDocumentId: documentId,
    });
    await store.ensureWorkspaceReadAcl(workspaceId, saved.id);
  }
}

/** Remove catalog rows for a document within a workspace. */
export async function deleteCatalogForDocument(
  workspaceId: string,
  documentId: string,
  store: EntityCatalogStore,
): Promise<number> {
  return store.deleteByDocument(workspaceId, documentId);
}

/** Exact normalized substring lookup for L1 entity linking (D-49). */
export async function findCatalogEntitiesInQuery(
  workspaceId: string,
  query: string,
  store: EntityCatalogStore,
): Promise<EntityCatalogRecord[]> {
  const rows = await store.findByWorkspace(workspaceId);
  return rows.filter((row) => queryContainsNormalizedName(query, row.normalizedName));
}

export type { EntityCatalogStore as EntityCatalogRepository };
