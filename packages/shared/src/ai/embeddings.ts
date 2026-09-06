import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { embed, embedMany } from "ai";

import { NVIDIA_EMBEDDING_MODEL, NVIDIA_NIM_BASE_URL } from "./embedding-models";

type NimInputType = "query" | "passage";
type EmbeddingModel = Parameters<typeof embed>[0]["model"];

function requireNimApiKey(): string {
  const apiKey = process.env.NIM_API_KEY;
  if (!apiKey) {
    throw new Error("NIM_API_KEY 未设置");
  }
  return apiKey;
}

/** 向 NIM /v1/embeddings 请求体注入 input_type（embedqa 模型必需） */
function createNimFetch(inputType: NimInputType): FetchFunction {
  return async (input, init) => {
    if (init?.body && typeof init.body === "string") {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      body.input_type = inputType;
      init = { ...init, body: JSON.stringify(body) };
    }
    return fetch(input, init);
  };
}

function createNimEmbeddingModel(inputType: NimInputType): EmbeddingModel {
  return createOpenAICompatible({
    name: "nim",
    baseURL: NVIDIA_NIM_BASE_URL,
    apiKey: requireNimApiKey(),
    fetch: createNimFetch(inputType),
  }).embeddingModel(NVIDIA_EMBEDDING_MODEL);
}

let queryEmbeddingModel: EmbeddingModel | undefined;
let passageEmbeddingModel: EmbeddingModel | undefined;

function getQueryEmbeddingModel(): EmbeddingModel {
  queryEmbeddingModel ??= createNimEmbeddingModel("query");
  return queryEmbeddingModel;
}

function getPassageEmbeddingModel(): EmbeddingModel {
  passageEmbeddingModel ??= createNimEmbeddingModel("passage");
  return passageEmbeddingModel;
}

/** 单条 query embedding（检索 / 路由预检 / HyDE 假设文档） */
export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: getQueryEmbeddingModel(),
    value: text,
  });
  return embedding;
}

/** 批量 passage embedding（入库 pipeline / seed 脚本） */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    const { embeddings } = await embedMany({
      model: getPassageEmbeddingModel(),
      values: texts,
    });
    return embeddings;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // NIM EOL 时常只抛 "Gone"；附带模型名便于运维定位
    if (/^Gone$/i.test(message) || /\b410\b/.test(message)) {
      throw new Error(
        `NIM embedding Gone (410): model ${NVIDIA_EMBEDDING_MODEL} unavailable — ${message}`,
      );
    }
    throw err;
  }
}
