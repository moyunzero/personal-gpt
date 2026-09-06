import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { WorkspaceEntity } from "./workspace.entity";
import type { WorkspaceRole } from "./workspace-member.entity";

@Entity("workspace_invites")
export class WorkspaceInviteEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId!: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace!: WorkspaceEntity;

  @Column({ type: "varchar" })
  email!: string;

  @Column({ type: "varchar", unique: true })
  token!: string;

  @Column({ type: "varchar" })
  role!: WorkspaceRole;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
