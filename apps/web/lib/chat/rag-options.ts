/**
 * RAG 增强开关与阈值（D-00f / RAG-04）。
 */

function readFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const ENABLE_HYDE = process.env.ENABLE_HYDE === "true";
export const ENABLE_MULTI_QUERY = process.env.ENABLE_MULTI_QUERY === "true";
/** D-11: rerank 默认开；设 ENABLE_RERANKER=false 可关 */
export const ENABLE_RERANKER = process.env.ENABLE_RERANKER !== "false";

/** 模糊问法由 LLM 判断 direct / retrieve；关闭则仅快速规则 + embedding 预检 */
export const ENABLE_LLM_QUERY_ROUTER = process.env.ENABLE_LLM_QUERY_ROUTER !== "false";

/** 路由前 embedding Top-1 预检；关闭则跳过向量探测 */
export const ENABLE_EMBEDDING_ROUTE_PRECHECK =
  process.env.ENABLE_EMBEDDING_ROUTE_PRECHECK !== "false";

/** 预检 Top-1 ≥ 此值 → 倾向 retrieve（跳过 LLM） */
export const ROUTE_RETRIEVE_SIMILARITY = readFloatEnv("ROUTE_RETRIEVE_SIMILARITY", 0.68);

/** 预检 Top-1 < 此值 → 倾向 direct（跳过 LLM） */
export const ROUTE_DIRECT_SIMILARITY = readFloatEnv("ROUTE_DIRECT_SIMILARITY", 0.42);

/** 初筛超时后的宽限期 */
export const RETRIEVAL_GRACE_MS = 10_000;

/** 检索命中 top1 低于此值时视为无有效命中 */
export const TOP1_SIMILARITY_THRESHOLD = 0.55;

/** psychology-qa 等 seed 语料注入门槛（高于用户上传，缓解混库挤占） */
export const SEED_CORPUS_SIMILARITY_THRESHOLD = readFloatEnv(
  "SEED_CORPUS_SIMILARITY_THRESHOLD",
  0.72,
);

export const RETRIEVAL_LIMIT = 5;
export const RERANKER_CANDIDATE_LIMIT = 10;
