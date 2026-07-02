import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
} from "typeorm";

import type { DocumentEntity } from "./document.entity";
import type { IngestJobEntity } from "./ingest-job.entity";

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

  @OneToMany(
    () => require("./document.entity").DocumentEntity,
    (doc: DocumentEntity) => doc.workspace,
  )
  documents!: DocumentEntity[];

  @OneToMany(
    () => require("./ingest-job.entity").IngestJobEntity,
    (job: IngestJobEntity) => job.workspace,
  )
  ingestJobs!: IngestJobEntity[];
}
