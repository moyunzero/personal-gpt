import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import type { IngestJobStatus } from "@personal-gpt/shared/types/kb";

import type { DocumentEntity } from "./document.entity";
import type { WorkspaceEntity } from "./workspace.entity";

@Entity("ingest_jobs")
export class IngestJobEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId!: string;

  @ManyToOne(
    () => require("./workspace.entity").WorkspaceEntity,
    (workspace: WorkspaceEntity) => workspace.ingestJobs,
    { onDelete: "CASCADE" },
  )
  @JoinColumn({ name: "workspace_id" })
  workspace!: WorkspaceEntity;

  @Column({ name: "document_id", type: "uuid" })
  documentId!: string;

  @ManyToOne(
    () => require("./document.entity").DocumentEntity,
    (document: DocumentEntity) => document.ingestJobs,
    { onDelete: "CASCADE" },
  )
  @JoinColumn({ name: "document_id" })
  document!: DocumentEntity;

  @Column({ type: "varchar", default: "queued" })
  status!: IngestJobStatus;

  @Column({ type: "int", default: 0 })
  progress!: number;

  @Column({ type: "text", nullable: true })
  error!: string | null;

  @Column({ name: "bull_job_id", type: "varchar", nullable: true })
  bullJobId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
