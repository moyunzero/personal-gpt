import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

import { UserEntity } from "./user.entity";
import { WorkspaceEntity } from "./workspace.entity";

export type WorkspaceRole = "owner" | "editor" | "viewer";

@Entity("workspace_members")
@Unique("UQ_workspace_members_workspace_user", ["workspaceId", "userId"])
export class WorkspaceMemberEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId!: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace!: WorkspaceEntity;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ type: "varchar" })
  role!: WorkspaceRole;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
