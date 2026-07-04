/**
 * 对指定 document 重跑 embed + upsert（修复 insertMany 未进 ANN 索引后的补救）。
 * 用法：npx ts-node --project tsconfig.scripts.json ./script/repairDocumentVectors.ts <documentId>
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../.env") });

import { embedTexts } from "@personal-gpt/shared/ai/embeddings";
import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import { createVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import { DataAPIClient } from "@datastax/astra-db-ts";

const DOC_ID =
  process.argv[2] ?? "dc3bff39-5ead-4a24-b6e4-b866e7483bb4";

async function main() {
  const client = new DataAPIClient(process.env.ASTRA_DB_APPLICATION_TOKEN!);
  const db = client.db(process.env.ASTRA_DB_API_ENDPOINT!, {
    token: process.env.ASTRA_DB_APPLICATION_TOKEN!,
  });
  const col = db.collection(process.env.ASTRA_DB_COLLECTION!);

  const chunks = (await col
    .find(
      { documentId: { $eq: DOC_ID } },
      {
        limit: 50,
        projection: {
          content: 1,
          chunkIndex: 1,
          title: 1,
          source: 1,
          category: 1,
          tags: 1,
          workspaceId: 1,
        },
      },
    )
    .toArray()) as Record<string, unknown>[];

  if (chunks.length === 0) {
    throw new Error(`No chunks for documentId=${DOC_ID}`);
  }

  const sorted = [...chunks].sort(
    (a, b) => Number(a.chunkIndex) - Number(b.chunkIndex),
  );
  const texts = sorted.map((c) => String(c.content ?? ""));
  const vectors = await embedTexts(texts);

  const store = createVectorStore();
  await store.upsert(
    sorted.map((c, i) => ({
      workspaceId: String(c.workspaceId ?? DEFAULT_WORKSPACE_ID),
      documentId: DOC_ID,
      chunkIndex: Number(c.chunkIndex),
      text: texts[i]!,
      vector: vectors[i]!,
      title: c.title as string | undefined,
      source: c.source as string | undefined,
      category: c.category as string | undefined,
      tags: c.tags as string[] | undefined,
    })),
  );

  console.log(`✔ repaired ${sorted.length} chunks for ${DOC_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
