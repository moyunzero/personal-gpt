import type { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceLlmModelBaseUrl1744100000000 implements MigrationInterface {
  name = "WorkspaceLlmModelBaseUrl1744100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_llm_models"
      ADD COLUMN IF NOT EXISTS "base_url" varchar NOT NULL DEFAULT ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workspace_llm_models" DROP COLUMN IF EXISTS "base_url"`);
  }
}
