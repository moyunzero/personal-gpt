import type { DataSource, Repository } from "typeorm";

import { type EntityCatalogRecord, type EntityCatalogStore } from "@personal-gpt/shared";

import { EntityAclEntity } from "./entities/entity-acl.entity";
import { EntityCatalogEntity } from "./entities/entity-catalog.entity";

function toRecord(row: EntityCatalogEntity): EntityCatalogRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    normalizedName: row.normalizedName,
    entityType: row.entityType,
    displayName: row.displayName,
    neo4jNodeId: row.neo4jNodeId,
    sourceDocumentId: row.sourceDocumentId,
  };
}

export function createEntityCatalogStore(dataSource: DataSource): EntityCatalogStore {
  const catalogRepo: Repository<EntityCatalogEntity> =
    dataSource.getRepository(EntityCatalogEntity);
  const aclRepo: Repository<EntityAclEntity> = dataSource.getRepository(EntityAclEntity);

  return {
    async findByWorkspace(workspaceId) {
      const rows = await catalogRepo.find({ where: { workspaceId } });
      return rows.map(toRecord);
    },

    async findByDocument(workspaceId, documentId) {
      const rows = await catalogRepo.find({ where: { workspaceId, sourceDocumentId: documentId } });
      return rows.map(toRecord);
    },

    async upsert(row) {
      const existing = await catalogRepo.findOne({
        where: {
          workspaceId: row.workspaceId,
          normalizedName: row.normalizedName,
          entityType: row.entityType,
        },
      });

      if (existing) {
        existing.displayName = row.displayName;
        existing.neo4jNodeId = row.neo4jNodeId;
        existing.sourceDocumentId = row.sourceDocumentId;
        const saved = await catalogRepo.save(existing);
        return toRecord(saved);
      }

      const created = catalogRepo.create({
        workspaceId: row.workspaceId,
        normalizedName: row.normalizedName,
        entityType: row.entityType,
        displayName: row.displayName,
        neo4jNodeId: row.neo4jNodeId,
        sourceDocumentId: row.sourceDocumentId,
      });
      const saved = await catalogRepo.save(created);
      return toRecord(saved);
    },

    async deleteByDocument(workspaceId, documentId) {
      const result = await catalogRepo.delete({ workspaceId, sourceDocumentId: documentId });
      return result.affected ?? 0;
    },

    async ensureWorkspaceReadAcl(workspaceId, entityCatalogId) {
      const existing = await aclRepo.findOne({
        where: {
          workspaceId,
          entityCatalogId,
          principalType: "workspace",
          principalId: workspaceId,
        },
      });
      if (existing) return;

      const acl = aclRepo.create({
        workspaceId,
        entityCatalogId,
        principalType: "workspace",
        principalId: workspaceId,
        permission: "read",
      });
      await aclRepo.save(acl);
    },
  };
}
