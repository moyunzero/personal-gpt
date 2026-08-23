import type { MigrationInterface, QueryRunner } from "typeorm";

export class AuthWorkspaceAcl1741000000000 implements MigrationInterface {
  name = "AuthWorkspaceAcl1741000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying,
        "email" character varying,
        "emailVerified" character varying,
        "image" character varying,
        "active_workspace_id" uuid,
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "type" character varying NOT NULL,
        "provider" character varying NOT NULL,
        "providerAccountId" character varying NOT NULL,
        "refresh_token" character varying,
        "access_token" character varying,
        "expires_at" bigint,
        "token_type" character varying,
        "scope" character varying,
        "id_token" character varying,
        "session_state" character varying,
        CONSTRAINT "PK_accounts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_accounts_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "sessionToken" character varying NOT NULL,
        "userId" uuid NOT NULL,
        "expires" character varying NOT NULL,
        CONSTRAINT "PK_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sessions_sessionToken" UNIQUE ("sessionToken"),
        CONSTRAINT "FK_sessions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "verification_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "token" character varying NOT NULL,
        "identifier" character varying NOT NULL,
        "expires" character varying NOT NULL,
        CONSTRAINT "PK_verification_tokens_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "workspace_members" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" character varying NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_members_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workspace_members_workspace_user" UNIQUE ("workspace_id", "user_id"),
        CONSTRAINT "FK_workspace_members_workspace_id" FOREIGN KEY ("workspace_id")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_workspace_members_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "workspace_invites" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL,
        "email" character varying NOT NULL,
        "token" character varying NOT NULL,
        "role" character varying NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_invites_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workspace_invites_token" UNIQUE ("token"),
        CONSTRAINT "FK_workspace_invites_workspace_id" FOREIGN KEY ("workspace_id")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "documents"
        ADD COLUMN "owner_id" uuid,
        ADD COLUMN "visibility" character varying NOT NULL DEFAULT 'workspace',
        ADD COLUMN "restricted_user_ids" jsonb NOT NULL DEFAULT '[]'
    `);

    await queryRunner.query(`
      ALTER TABLE "documents"
        ADD CONSTRAINT "FK_documents_owner_id"
        FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "FK_users_active_workspace_id"
        FOREIGN KEY ("active_workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_active_workspace_id"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "FK_documents_owner_id"`);
    await queryRunner.query(`
      ALTER TABLE "documents"
        DROP COLUMN IF EXISTS "restricted_user_ids",
        DROP COLUMN IF EXISTS "visibility",
        DROP COLUMN IF EXISTS "owner_id"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_invites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "verification_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
