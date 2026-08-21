import { Client } from "@elastic/elasticsearch";

let client: Client | undefined;

/** Singleton ES client from ES_NODE (default http://localhost:9200). */
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
