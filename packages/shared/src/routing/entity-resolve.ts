import type { EntityType } from "../graph/extract-schema";
import { findCatalogEntitiesInQuery, type EntityCatalogStore } from "../graph/entity-catalog";
import { normalizeEntityName } from "../graph/normalize-entity";
import { resolveSeedProductName } from "./graph-entities";

export type ResolvedGraphEntity = {
  source: "catalog" | "seed";
  displayName: string;
  normalizedName: string;
  entityType?: EntityType;
  neo4jNodeId?: string;
};

export type ResolveGraphEntityDeps = {
  catalogStore?: EntityCatalogStore;
  /** Security trim: omit entities from forbidden documents (D-50). */
  allowedDocumentIds?: string[];
};

let catalogStoreOverride: EntityCatalogStore | null = null;

/** Test hook for catalog-first routing without live PG. */
export function setEntityCatalogStoreForTests(store: EntityCatalogStore | null): void {
  catalogStoreOverride = store;
}

/** Catalog lookup first (D-05), seed regex fallback (D-49). */
export async function resolveGraphEntity(
  query: string,
  workspaceId?: string,
  deps: ResolveGraphEntityDeps = {},
): Promise<ResolvedGraphEntity | null> {
  const store = deps.catalogStore ?? catalogStoreOverride;
  if (workspaceId && store) {
    const hits = await findCatalogEntitiesInQuery(workspaceId, query, store);
    const allowed = deps.allowedDocumentIds;
    const filtered =
      allowed?.length && allowed.length > 0
        ? hits.filter((hit) => allowed.includes(hit.sourceDocumentId))
        : hits;
    if (filtered.length > 0) {
      const hit = filtered[0]!;
      return {
        source: "catalog",
        displayName: hit.displayName,
        normalizedName: hit.normalizedName,
        entityType: hit.entityType,
        neo4jNodeId: hit.neo4jNodeId,
      };
    }
  }

  const seed = resolveSeedProductName(query);
  if (seed) {
    return {
      source: "seed",
      displayName: seed,
      normalizedName: normalizeEntityName(seed),
      entityType: "product",
    };
  }

  return null;
}
