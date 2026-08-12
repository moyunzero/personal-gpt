/**
 * 在 Vercel build 中执行 KB schema 迁移（Sensitive DATABASE_URL 无法本地 pull）。
 * 幂等：已有 documents 表则跳过；并写入 TypeORM migrations 记录。
 */
import pg from "pg";

const DEFAULT_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const MIGRATION_NAME = "InitWorkspaceKb1730000000000";
const MIGRATION_TIMESTAMP = "1730000000000";

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("[migrate] DATABASE_URL 未设置");
  }
  if (url === "[SENSITIVE]" || !url.startsWith("postgres")) {
    throw new Error("[migrate] DATABASE_URL 无效（可能被 redact）");
  }
  return url;
}

async function main() {
  const connectionString = requireDatabaseUrl();
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 20_000,
    ssl: connectionString.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const exists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'documents'
      ) AS ok
    `);

    if (exists.rows[0]?.ok) {
      console.log("[migrate] documents 已存在，跳过建表");
    } else {
      console.log("[migrate] 创建 workspaces / documents / ingest_jobs …");
      await client.query("BEGIN");
      await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
      await client.query(`
        CREATE TABLE "workspaces" (
          "id" uuid NOT NULL,
          "slug" character varying NOT NULL,
          "name" character varying NOT NULL,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT "PK_workspaces_id" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_workspaces_slug" UNIQUE ("slug")
        )
      `);
      await client.query(`
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
      await client.query(`
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
      await client.query(
        `
        INSERT INTO "workspaces" ("id", "slug", "name")
        VALUES ($1, 'default', 'Default Workspace')
        ON CONFLICT ("slug") DO NOTHING
      `,
        [DEFAULT_WORKSPACE_ID],
      );
      await client.query("COMMIT");
      console.log("[migrate] 建表完成");
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS "migrations" (
        "id" SERIAL NOT NULL,
        "timestamp" bigint NOT NULL,
        "name" character varying NOT NULL,
        CONSTRAINT "PK_migrations_id" PRIMARY KEY ("id")
      )
    `);
    const recorded = await client.query(
      `SELECT 1 FROM "migrations" WHERE "name" = $1 LIMIT 1`,
      [MIGRATION_NAME],
    );
    if (recorded.rowCount === 0) {
      await client.query(
        `INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)`,
        [MIGRATION_TIMESTAMP, MIGRATION_NAME],
      );
      console.log(`[migrate] 已记录 ${MIGRATION_NAME}`);
    } else {
      console.log(`[migrate] ${MIGRATION_NAME} 已在 migrations 表中`);
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[migrate] 失败:", error instanceof Error ? error.message : error);
  process.exit(1);
});
