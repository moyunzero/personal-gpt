/**
 * NVIDIA NIM embedding（2048 维）；聊天与 RAG 辅助均走 Groq。
 */

export const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * 中文 RAG / QA 检索（2048 维）。
 * `llama-nemotron-embed-1b-v2` / `nv-embedqa-e5-v5` 已于 2026-08-25 EOL（API 返回 410 Gone），
 * 改用 `nemotron-3-embed-1b`（同维，生产 catalog 可用）。
 */
export const NVIDIA_EMBEDDING_MODEL = "nvidia/nemotron-3-embed-1b";

export const EMBEDDING_DIMENSION = 2048;
