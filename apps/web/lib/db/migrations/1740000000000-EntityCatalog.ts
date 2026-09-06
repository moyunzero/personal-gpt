import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Wave 0 entity catalog + entity ACL skeleton (D-47, D-50).
 * entity_acl defaults to workspace-readable at ingest until document visibility lands in 04-05.
 */
export class EntityCatalog1740000000000 implements MigrationInterface {
  name = "EntityCatalog1740000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "entity_catalog" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL,
        "normalized_name" character varying NOT NULL,
        "entity_type" character varying NOT NULL,
        "display_name" character varying NOT NULL,
        "neo4j_node_id" character varying NOT NULL,
        "source_document_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_entity_catalog_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_entity_catalog_workspace_normalized_type"
          UNIQUE ("workspace_id", "normalized_name", "entity_type"),
        CONSTRAINT "FK_entity_catalog_workspace_id" FOREIGN KEY ("workspace_id")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_entity_catalog_source_document_id" FOREIGN KEY ("source_document_id")
          REFERENCES "documents"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_entity_catalog_workspace_id" ON "entity_catalog" ("workspace_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "entity_acl" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL,
        "entity_catalog_id" uuid NOT NULL,
        "principal_type" character varying NOT NULL,
        "principal_id" uuid NOT NULL,
        "permission" character varying NOT NULL,
        CONSTRAINT "PK_entity_acl_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_entity_acl_workspace_id" FOREIGN KEY ("workspace_id")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_entity_acl_entity_catalog_id" FOREIGN KEY ("entity_catalog_id")
          REFERENCES "entity_catalog"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_entity_acl_workspace_entity" ON "entity_acl" ("workspace_id", "entity_catalog_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "entity_acl"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "entity_catalog"`);
  }
}
