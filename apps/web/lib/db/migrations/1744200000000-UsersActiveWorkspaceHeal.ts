import type { MigrationInterface, QueryRunner } from "typeorm";

/** Auth.js can recreate users without active_workspace_id after the earlier migration. */
export class UsersActiveWorkspaceHeal1744200000000 implements MigrationInterface {
  name = "UsersActiveWorkspaceHeal1744200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active_workspace_id" uuid
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
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "active_workspace_id"`);
  }
}
