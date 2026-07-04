/**
 * 为 NVIDIA NIM embedding（2048 维）创建 Astra collection。
 * 用法：yarn astra:init-embedding
 */
import "dotenv/config";
import { DataAPIClient } from "@datastax/astra-db-ts";

import { EMBEDDING_DIMENSION } from "@personal-gpt/shared/ai/embedding-models";

const COLLECTION = process.env.ASTRA_DB_COLLECTION ?? "db_emotion";
const { ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN } = process.env;

if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN) {
  throw new Error("缺少 ASTRA_DB_API_ENDPOINT / ASTRA_DB_APPLICATION_TOKEN");
}

async function main() {
  const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
  const db = client.db(ASTRA_DB_API_ENDPOINT, { token: ASTRA_DB_APPLICATION_TOKEN });

  try {
    const res = await db.createCollection(COLLECTION, {
      vector: { dimension: EMBEDDING_DIMENSION, metric: "dot_product" },
    });
    console.log(`✔ 已创建 collection「${COLLECTION}」（${EMBEDDING_DIMENSION} 维）`, res);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("already exists") || msg.includes("CollectionAlreadyExists")) {
      console.log(`⏭ collection「${COLLECTION}」已存在，跳过创建`);
    } else {
      throw error;
    }
  }

  console.log(`\n请将 .env 中 ASTRA_DB_COLLECTION 设为：${COLLECTION}`);
  console.log("然后执行：yarn seed:suggestions");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
