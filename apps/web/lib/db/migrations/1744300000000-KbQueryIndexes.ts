import type { MigrationInterface, QueryRunner } from "typeorm";

/** Indexes for document list / ingest job / chat message lookups. */
export class KbQueryIndexes1744300000000 implements MigrationInterface {
  name = "KbQueryIndexes1744300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_documents_workspace_status_created"
      ON "documents" ("workspace_id", "status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ingest_jobs_document_id"
      ON "ingest_jobs" ("document_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_messages_session_id"
      ON "chat_messages" ("session_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_session_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ingest_jobs_document_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_workspace_status_created"`);
  }
}
