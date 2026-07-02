import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared";
import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitWorkspaceKb1730000000000 implements MigrationInterface {
  name = "InitWorkspaceKb1730000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workspaces" (
        "id" uuid NOT NULL,
        "slug" character varying NOT NULL,
        "name" character varying NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspaces_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workspaces_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL,
        "title" character varying NOT NULL,
        "source" character varying,
        "category" character varying,
        "tags" jsonb NOT NULL DEFAULT '[]',
        "status" character varying NOT NULL DEFAULT 'pending',
        "chunk_count" integer NOT NULL DEFAULT 0,
        "file_path" text,
        "mime_type" character varying,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_documents_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_documents_workspace_id" FOREIGN KEY ("workspace_id")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ingest_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL,
        "document_id" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'queued',
        "progress" integer NOT NULL DEFAULT 0,
        "error" text,
        "bull_job_id" character varying,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ingest_jobs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ingest_jobs_workspace_id" FOREIGN KEY ("workspace_id")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ingest_jobs_document_id" FOREIGN KEY ("document_id")
          REFERENCES "documents"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `
      INSERT INTO "workspaces" ("id", "slug", "name")
      VALUES ($1, 'default', 'Default Workspace')
      ON CONFLICT ("slug") DO NOTHING
    `,
      [DEFAULT_WORKSPACE_ID],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ingest_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspaces"`);
  }
}
