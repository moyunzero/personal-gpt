import type { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceLlmModels1744000000000 implements MigrationInterface {
  name = "WorkspaceLlmModels1744000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_llm_models" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL,
        "model_id" varchar NOT NULL,
        "api_key" varchar NOT NULL DEFAULT '',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_workspace_llm_models_ws_model" UNIQUE ("workspace_id", "model_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_llm_prefs" (
        "workspace_id" uuid PRIMARY KEY,
        "chat_model_id" varchar NOT NULL DEFAULT '',
        "agent_model_id" varchar NOT NULL DEFAULT '',
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_llm_prefs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_llm_models"`);
  }
}
