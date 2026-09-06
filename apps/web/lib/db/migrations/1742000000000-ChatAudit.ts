import type { MigrationInterface, QueryRunner } from "typeorm";

export class ChatAudit1742000000000 implements MigrationInterface {
  name = "ChatAudit1742000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chat_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "thread_id" character varying NOT NULL,
        "user_id" uuid NOT NULL,
        "workspace_id" uuid NOT NULL,
        "mode" character varying NOT NULL DEFAULT 'chat',
        "title" character varying NOT NULL DEFAULT '',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chat_sessions_thread_id" UNIQUE ("thread_id"),
        CONSTRAINT "FK_chat_sessions_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_sessions_workspace_id" FOREIGN KEY ("workspace_id")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_chat_sessions_user_workspace"
      ON "chat_sessions" ("user_id", "workspace_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "session_id" uuid NOT NULL,
        "role" character varying NOT NULL,
        "content" text NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chat_messages_session_id" FOREIGN KEY ("session_id")
          REFERENCES "chat_sessions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "action" character varying NOT NULL,
        "resource" character varying NOT NULL,
        "user_id" uuid,
        "workspace_id" uuid,
        "status_code" integer NOT NULL,
        "latency_ms" integer NOT NULL,
        "request_id" character varying,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_user_created"
      ON "audit_logs" ("user_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_sessions"`);
  }
}
