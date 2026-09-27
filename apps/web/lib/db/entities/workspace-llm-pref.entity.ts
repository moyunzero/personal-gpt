import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("workspace_llm_prefs")
export class WorkspaceLlmPrefEntity {
  @PrimaryColumn({ name: "workspace_id", type: "uuid" })
  workspaceId!: string;

  @Column({ name: "chat_model_id", type: "varchar", default: "" })
  chatModelId!: string;

  @Column({ name: "agent_model_id", type: "varchar", default: "" })
  agentModelId!: string;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
