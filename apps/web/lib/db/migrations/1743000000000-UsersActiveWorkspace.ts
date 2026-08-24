import type { MigrationInterface, QueryRunner } from "typeorm";

/** Fix: Auth.js created users table before AuthWorkspaceAcl; active_workspace_id may be missing. */
export class UsersActiveWorkspace1743000000000 implements MigrationInterface {
  name = "UsersActiveWorkspace1743000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active_workspace_id" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "users"
          ADD CONSTRAINT "FK_users_active_workspace_id"
          FOREIGN KEY ("active_workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      UPDATE "users" u
      SET "active_workspace_id" = m.workspace_id
      FROM (
        SELECT DISTINCT ON (user_id) user_id, workspace_id
        FROM workspace_members
        ORDER BY user_id, created_at ASC
      ) m
      WHERE u.id = m.user_id AND u."active_workspace_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_active_workspace_id"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "active_workspace_id"`);
  }
}
