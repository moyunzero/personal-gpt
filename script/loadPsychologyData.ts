import "dotenv/config";
import { DataAPIClient } from "@datastax/astra-db-ts";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import * as fs from "fs";
import * as path from "path";

import { embedTexts } from "@personal-gpt/shared/ai/embeddings";
import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";

const WORKSPACE_ID = process.env.WORKSPACE_ID ?? DEFAULT_WORKSPACE_ID;
import { EMBEDDING_DIMENSION } from "@personal-gpt/shared/ai/embedding-models";

const {
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
} = process.env;

if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN) {
  throw new Error(
    "Missing required environment variables: ASTRA_DB_API_ENDPOINT and ASTRA_DB_APPLICATION_TOKEN",
  );
}

interface PsychologyQA {
  input: string;
  content: string;
  reasoning_content: string;
}

// 进度文件路径
const PROGRESS_FILE = path.join(__dirname, "../data/.psychology-progress.json");

// 读取进度
function loadProgress(): { lastIndex: number; processedIds: Set<string> } {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
      return {
        lastIndex: data.lastIndex || 0,
        processedIds: new Set(data.processedIds || []),
      };
    }
  } catch (_error) {
    console.log("无法读取进度文件，从头开始");
  }
  return { lastIndex: 0, processedIds: new Set() };
}

// 保存进度
function saveProgress(lastIndex: number, processedIds: Set<string>) {
  fs.writeFileSync(
    PROGRESS_FILE,
    JSON.stringify({
      lastIndex,
      processedIds: Array.from(processedIds),
      timestamp: new Date().toISOString(),
    }),
  );
}

// 批量生成向量嵌入（NVIDIA NIM；免费层 ~40 RPM）
function parseQuotaRetryMs(errorMsg: string): number | null {
  const match = errorMsg.match(/retry in ([\d.]+)s/i);
  if (match) {
    return Math.ceil(parseFloat(match[1]!) * 1000) + 500;
  }
  return null;
}

function isQuotaError(errorMsg: string): boolean {
  return /quota exceeded|rate limit|429/i.test(errorMsg);
}

const getEmbeddingsBatch = async (texts: string[], retries = 12): Promise<number[][]> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await embedTexts(texts);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isLastAttempt = attempt === retries;

      if (isLastAttempt) {
        throw new Error(`批量生成 embedding 失败 (已重试 ${retries} 次): ${errorMsg}`);
      }

      const quotaDelay = parseQuotaRetryMs(errorMsg);
      const delay = quotaDelay ?? (isQuotaError(errorMsg) ? 60_000 : 2000 * attempt);
      console.log(
        `\n  ⚠ Embedding 生成失败 (尝试 ${attempt}/${retries}): ${errorMsg.slice(0, 200)}`,
      );
      console.log(`  ⏳ ${(delay / 1000).toFixed(0)} 秒后重试...`);
      await sleep(delay);
    }
  }

  throw new Error("批量生成 embedding 失败");
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, {
  token: ASTRA_DB_APPLICATION_TOKEN,
});

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 100,
});

const createCollection = async (
  similarityMetric: "dot_product" | "cosine" | "euclidean" = "dot_product",
  retries = 3,
) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`尝试创建集合... (${i + 1}/${retries})`);
      const res = await db.createCollection(ASTRA_DB_COLLECTION!, {
        vector: {
          dimension: EMBEDDING_DIMENSION,
          metric: similarityMetric,
        },
      });
      console.log("集合创建成功:", res);
      return res;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`创建失败，${2}秒后重试...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
};

const loadPsychologyData = async () => {
  const collection = db.collection(ASTRA_DB_COLLECTION!);

  const dataPath = path.join(__dirname, "../data/psychology-10k-Deepseek-R1-zh.json");
  console.log(`\n正在读取数据文件: ${dataPath}`);

  const fileContent = fs.readFileSync(dataPath, "utf-8");
  const lines = fileContent.trim().split("\n");
  const allQaData: PsychologyQA[] = lines.map((line) => JSON.parse(line));

  const LIMIT = process.env.LOAD_LIMIT ? parseInt(process.env.LOAD_LIMIT) : allQaData.length;
  const qaData = allQaData.slice(0, LIMIT);

  console.log(`✔ 成功读取 ${allQaData.length} 条数据，将加载前 ${qaData.length} 条`);

  const progress = loadProgress();
  console.log(
    `📍 从第 ${progress.lastIndex + 1} 条开始加载 (已处理 ${progress.processedIds.size} 条)`,
  );

  let totalInserted = 0;
  const startTime = Date.now();

  const BATCH_SIZE = 3;
  const CONCURRENT_BATCHES = 1;
  // 免费层按「条数」计 RPM，单批越小、间隔越大越稳
  const EMBED_BATCH_SIZE = parseInt(process.env.EMBED_BATCH_SIZE ?? "8", 10);
  const EMBED_DELAY_MS = parseInt(process.env.EMBED_DELAY_MS ?? "800", 10);

  for (
    let batchStart = progress.lastIndex;
    batchStart < qaData.length;
    batchStart += BATCH_SIZE * CONCURRENT_BATCHES
  ) {
    const batchPromises = [];

    for (let b = 0; b < CONCURRENT_BATCHES; b++) {
      const currentBatchStart = batchStart + b * BATCH_SIZE;
      if (currentBatchStart >= qaData.length) break;

      const batchEnd = Math.min(currentBatchStart + BATCH_SIZE, qaData.length);
      const batch = qaData.slice(currentBatchStart, batchEnd);

      const batchPromise = (async () => {
        const batchResults = [];

        for (let i = 0; i < batch.length; i++) {
          const qa = batch[i];
          const globalIndex = currentBatchStart + i;
          const qaId = `qa-${globalIndex}`;

          if (progress.processedIds.has(qaId)) {
            console.log(
              `[${globalIndex + 1}/${qaData.length}] 跳过已处理: ${qa.input.substring(0, 30)}...`,
            );
            continue;
          }

          console.log(
            `[${globalIndex + 1}/${qaData.length}] 处理: ${qa.input.substring(0, 50)}...`,
          );

          const combinedText = `问题: ${qa.input}\n\n回答: ${qa.content}\n\n推理: ${qa.reasoning_content}`;
          const chunks = await splitter.splitText(combinedText);

          batchResults.push({
            qaId,
            globalIndex,
            qa,
            chunks,
          });
        }

        return batchResults;
      })();

      batchPromises.push(batchPromise);
    }

    const allBatchResults = (await Promise.all(batchPromises)).flat();

    if (allBatchResults.length === 0) continue;

    const allChunks: string[] = [];
    const chunkMapping: Array<{
      qaId: string;
      globalIndex: number;
      qa: PsychologyQA;
      chunkIndex: number;
    }> = [];

    for (const result of allBatchResults) {
      for (let i = 0; i < result.chunks.length; i++) {
        allChunks.push(result.chunks[i]);
        chunkMapping.push({
          qaId: result.qaId,
          globalIndex: result.globalIndex,
          qa: result.qa,
          chunkIndex: i,
        });
      }
    }

    console.log(`  🔄 批量生成 ${allChunks.length} 个向量...`);

    const embeddings: number[][] = [];
    let embedRequestsThisMinute = 0;
    let minuteWindowStart = Date.now();

    for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
      const chunkBatch = allChunks.slice(i, Math.min(i + EMBED_BATCH_SIZE, allChunks.length));
      const batchEmbeddings = await getEmbeddingsBatch(chunkBatch);
      embeddings.push(...batchEmbeddings);
      embedRequestsThisMinute += 1;

      // NIM 免费层约 40 RPM，按 API 调用计
      if (embedRequestsThisMinute >= 35) {
        const elapsed = Date.now() - minuteWindowStart;
        if (elapsed < 60_000) {
          const waitMs = 60_000 - elapsed + 1000;
          console.log(`  ⏸ 已接近 NIM RPM 限额，等待 ${(waitMs / 1000).toFixed(0)} 秒...`);
          await sleep(waitMs);
        }
        embedRequestsThisMinute = 0;
        minuteWindowStart = Date.now();
      } else if (i + EMBED_BATCH_SIZE < allChunks.length) {
        await sleep(EMBED_DELAY_MS);
      }
    }

    console.log(`  ✔ 向量生成完成，开始批量插入...`);

    // 批量插入数据库（减少并发数避免超时）
    const insertPromises = [];
    for (let i = 0; i < embeddings.length; i++) {
      const mapping = chunkMapping[i];
      const embedding = embeddings[i];

      insertPromises.push(
        collection.insertOne({
          $vector: embedding,
          content: allChunks[i],
          workspaceId: WORKSPACE_ID,
          source: "psychology-qa",
          question: mapping.qa.input,
          category: "psychology",
          chunkIndex: mapping.chunkIndex, // 添加块索引
          qaId: mapping.qaId,
          // fullAnswer 只在第一个块存储，其他块不存储
          ...(mapping.chunkIndex === 0 ? { fullAnswer: mapping.qa.content } : {}),
        }),
      );

      // 每10个插入操作批量执行（减少并发避免超时）
      if (insertPromises.length >= 10 || i === embeddings.length - 1) {
        await Promise.all(insertPromises);
        totalInserted += insertPromises.length;
        insertPromises.length = 0;

        // 小延迟避免数据库压力
        if (i < embeddings.length - 1) {
          await sleep(100);
        }
      }
    }

    for (const result of allBatchResults) {
      progress.processedIds.add(result.qaId);
      progress.lastIndex = Math.max(progress.lastIndex, result.globalIndex);
    }

    saveProgress(progress.lastIndex, progress.processedIds);

    const currentIndex = batchStart + BATCH_SIZE * CONCURRENT_BATCHES;
    const pct = ((currentIndex / qaData.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const avgTime = ((Date.now() - startTime) / currentIndex / 1000).toFixed(1);
    const remaining = (((qaData.length - currentIndex) * parseFloat(avgTime)) / 60).toFixed(1);

    console.log(`\n📊 进度: ${Math.min(currentIndex, qaData.length)}/${qaData.length} (${pct}%)`);
    console.log(`   已用: ${elapsed}分钟 | 平均: ${avgTime}秒/条 | 预计剩余: ${remaining}分钟`);
    console.log(`   已插入向量: ${totalInserted} 个\n`);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✅ 所有数据加载完成！`);
  console.log(`   总计处理: ${qaData.length} 条问答`);
  console.log(`   总计插入: ${totalInserted} 个向量块`);
  console.log(`   总用时: ${totalTime} 分钟`);

  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
    console.log(`   已清理进度文件`);
  }
};

(async () => {
  try {
    console.log("开始心理学数据加载流程...");
    console.log("WorkspaceId:", WORKSPACE_ID);
    console.log("API Endpoint:", ASTRA_DB_API_ENDPOINT);
    console.log("Namespace:", ASTRA_DB_NAMESPACE);
    console.log("Collection:", ASTRA_DB_COLLECTION);

    console.log("\n正在连接到 AstraDB...");
    const collections = await db.listCollections();
    console.log(
      "连接成功！现有集合:",
      collections.map((c) => c.name),
    );

    const collectionExists = collections.some((col) => col.name === ASTRA_DB_COLLECTION);

    if (!collectionExists) {
      console.log(`\n集合 ${ASTRA_DB_COLLECTION} 不存在，正在创建...`);
      await createCollection();
      console.log("集合创建成功！");
    } else {
      console.log(`\n集合 ${ASTRA_DB_COLLECTION} 已存在`);
    }

    await loadPsychologyData();

    console.log("\n✅ 所有操作完成！");
  } catch (error) {
    console.error("\n❌ 错误:", error);
    process.exit(1);
  }
})();
