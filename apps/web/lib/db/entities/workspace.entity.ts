import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from "typeorm";

@Entity("workspaces")
export class WorkspaceEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "varchar", unique: true })
  slug!: string;

  @Column({ type: "varchar" })
  name!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
