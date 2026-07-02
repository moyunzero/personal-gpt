import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
} from "typeorm";

import { DocumentEntity } from "./document.entity";
import { IngestJobEntity } from "./ingest-job.entity";

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

  @OneToMany(() => DocumentEntity, (doc) => doc.workspace)
  documents!: DocumentEntity[];

  @OneToMany(() => IngestJobEntity, (job) => job.workspace)
  ingestJobs!: IngestJobEntity[];
}
