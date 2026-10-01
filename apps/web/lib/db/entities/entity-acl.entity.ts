import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

import { EntityCatalogEntity } from "./entity-catalog.entity";
import { WorkspaceEntity } from "./workspace.entity";

export type EntityAclPrincipalType = "user" | "workspace";
export type EntityAclPermission = "read" | "none";

/**
 * entity_acl — mirrored at ingest/sync only (syncEntityAclForDocument).
 * Retrieval ACL uses document visibility + resolveAllowedDocumentIds; this table is not read at query time.
 */
@Entity("entity_acl")
export class EntityAclEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId!: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace!: WorkspaceEntity;

  @Column({ name: "entity_catalog_id", type: "uuid" })
  entityCatalogId!: string;

  @ManyToOne(() => EntityCatalogEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "entity_catalog_id" })
  entityCatalog!: EntityCatalogEntity;

  @Column({ name: "principal_type", type: "varchar" })
  principalType!: EntityAclPrincipalType;

  @Column({ name: "principal_id", type: "uuid" })
  principalId!: string;

  @Column({ type: "varchar" })
  permission!: EntityAclPermission;
}
