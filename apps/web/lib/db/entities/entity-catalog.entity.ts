import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

import type { EntityType } from "@personal-gpt/shared";

import { DocumentEntity } from "./document.entity";
import { WorkspaceEntity } from "./workspace.entity";

@Entity("entity_catalog")
@Unique("UQ_entity_catalog_workspace_normalized_type", [
  "workspaceId",
  "normalizedName",
  "entityType",
])
export class EntityCatalogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId!: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace!: WorkspaceEntity;

  @Column({ name: "normalized_name", type: "varchar" })
  normalizedName!: string;

  @Column({ name: "entity_type", type: "varchar" })
  entityType!: EntityType;

  @Column({ name: "display_name", type: "varchar" })
  displayName!: string;

  @Column({ name: "neo4j_node_id", type: "varchar" })
  neo4jNodeId!: string;

  @Column({ name: "source_document_id", type: "uuid" })
  sourceDocumentId!: string;

  @ManyToOne(() => DocumentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "source_document_id" })
  sourceDocument!: DocumentEntity;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
