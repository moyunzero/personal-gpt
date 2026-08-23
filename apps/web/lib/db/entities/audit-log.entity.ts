import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("audit_logs")
@Index("IDX_audit_logs_user_created", ["userId", "createdAt"])
export class AuditLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  action!: string;

  @Column({ type: "varchar" })
  resource!: string;

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId!: string | null;

  @Column({ name: "workspace_id", type: "uuid", nullable: true })
  workspaceId!: string | null;

  @Column({ name: "status_code", type: "int" })
  statusCode!: number;

  @Column({ name: "latency_ms", type: "int" })
  latencyMs!: number;

  @Column({ name: "request_id", type: "varchar", nullable: true })
  requestId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
