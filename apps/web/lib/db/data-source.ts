import "dotenv/config";
import "reflect-metadata";
import { DataSource } from "typeorm";

import { DocumentEntity } from "./entities/document.entity";
import { IngestJobEntity } from "./entities/ingest-job.entity";
import { WorkspaceEntity } from "./entities/workspace.entity";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "[db] DATABASE_URL 未设置。请 cp .env.example .env 并启动 docker compose postgres。",
  );
}

export const AppDataSource = new DataSource({
  type: "postgres",
  url: databaseUrl,
  synchronize: false,
  logging: false,
  entities: [WorkspaceEntity, DocumentEntity, IngestJobEntity],
  migrations: [`${__dirname}/migrations/*.{ts,js}`],
});

export default AppDataSource;
