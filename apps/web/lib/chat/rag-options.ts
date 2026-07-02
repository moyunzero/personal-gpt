/**
 * 可选 RAG 增强开关（D-00f / RAG-04）。默认全部关闭，保持轻量检索路径。
 */

export const ENABLE_HYDE = process.env.ENABLE_HYDE === "true";
export const ENABLE_MULTI_QUERY = process.env.ENABLE_MULTI_QUERY === "true";
export const ENABLE_RERANKER = process.env.ENABLE_RERANKER === "true";

/** top1 向量相似度低于此值时视为无有效命中（与 shouldUseVectorSearch 二阶段配合） */
export const TOP1_SIMILARITY_THRESHOLD = 0.55;

/** 初筛条数；Reranker 开启时会先取更多再重排 */
export const RETRIEVAL_LIMIT = 5;
export const RERANKER_CANDIDATE_LIMIT = 10;
