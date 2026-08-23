import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import type { DocumentStatus } from "@personal-gpt/shared/types/kb";

import { UserEntity } from "./user.entity";
import { WorkspaceEntity } from "./workspace.entity";

export type DocumentVisibility = "workspace" | "private" | "restricted";

@Entity("documents")
export class DocumentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId!: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace!: WorkspaceEntity;

  @Column({ type: "varchar" })
  title!: string;

  @Column({ type: "varchar", nullable: true })
  source!: string | null;

  @Column({ type: "varchar", nullable: true })
  category!: string | null;

  @Column({ type: "jsonb", default: () => "'[]'" })
  tags!: string[];

  @Column({ type: "varchar", default: "pending" })
  status!: DocumentStatus;

  @Column({ name: "chunk_count", type: "int", default: 0 })
  chunkCount!: number;

  @Column({ name: "file_path", type: "text", nullable: true })
  filePath!: string | null;

  @Column({ name: "mime_type", type: "varchar", nullable: true })
  mimeType!: string | null;

  @Column({ name: "owner_id", type: "uuid", nullable: true })
  ownerId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "owner_id" })
  owner!: UserEntity | null;

  @Column({ type: "varchar", default: "workspace" })
  visibility!: DocumentVisibility;

  @Column({ name: "restricted_user_ids", type: "jsonb", default: () => "'[]'" })
  restrictedUserIds!: string[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
