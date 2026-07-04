import "dotenv/config";
import "reflect-metadata";
import { DataSource } from "typeorm";

import { DocumentEntity } from "./entities/document.entity";
import { IngestJobEntity } from "./entities/ingest-job.entity";
import { WorkspaceEntity } from "./entities/workspace.entity";

const ENTITIES = [WorkspaceEntity, DocumentEntity, IngestJobEntity];
const MIGRATIONS = [`${__dirname}/migrations/[0-9]*-*.{ts,js}`];

function buildDataSource(): DataSource {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "[db] DATABASE_URL 未设置。请 cp .env.example .env 并启动 docker compose postgres。",
    );
  }

  return new DataSource({
    type: "postgres",
    url: databaseUrl,
    synchronize: false,
    logging: false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
  });
}

let instance: DataSource | undefined;

/** 懒创建单例；Next.js build 阶段不触发，仅在 runtime / migration CLI 访问时校验 */
export function getAppDataSource(): DataSource {
  if (!instance) {
    instance = buildDataSource();
  }
  return instance;
}

/** TypeORM CLI：migration:run -d lib/db/data-source.ts */
const defaultExport: DataSource = new Proxy({} as DataSource, {
  get(_target, prop) {
    const ds = getAppDataSource();
    const value = Reflect.get(ds, prop, ds);
    return typeof value === "function" ? value.bind(ds) : value;
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(getAppDataSource(), prop);
  },
  ownKeys() {
    return Reflect.ownKeys(getAppDataSource());
  },
  getPrototypeOf() {
    return Object.getPrototypeOf(getAppDataSource());
  },
});

export default defaultExport;
