import { Client } from "@elastic/elasticsearch";

let client: Client | undefined;

/**
 * 生产（Vercel / CloudRun）常不配 ES；仅当显式设置 ES_NODE 时启用 BM25 dual-write。
 * 本地 Compose 通过 docker-compose 注入 ES_NODE=http://elasticsearch:9200。
 */
export function isEsConfigured(source: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(source.ES_NODE?.trim());
}

/** Singleton ES client from ES_NODE (default http://localhost:9200 when configured path is used). */
export function getEsClient(): Client {
  if (!client) {
    const node = process.env.ES_NODE?.trim() || "http://localhost:9200";
    client = new Client({ node });
  }
  return client;
}

/** Test/reset helper — clears singleton between unit tests. */
export function resetEsClientForTests(): void {
  client = undefined;
}
