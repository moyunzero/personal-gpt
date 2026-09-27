import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("workspace_llm_models")
@Index("UQ_workspace_llm_models_ws_model", ["workspaceId", "modelId"], { unique: true })
export class WorkspaceLlmModelEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId!: string;

  @Column({ name: "model_id", type: "varchar" })
  modelId!: string;

  /** Server-only. Never serialize to the client. */
  @Column({ name: "api_key", type: "varchar", default: "" })
  apiKey!: string;

  /** OpenAI-compatible base URL for this saved model. Not a secret. */
  @Column({ name: "base_url", type: "varchar", default: "" })
  baseUrl!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
