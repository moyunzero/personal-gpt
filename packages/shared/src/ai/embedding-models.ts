/**
 * NVIDIA NIM embedding（2048 维）；聊天与 RAG 辅助均走 Groq。
 */

export const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** 中文 RAG / QA 检索（2048 维）；embedqa-1b-v2 已 EOL，改用 nemotron-embed-1b-v2 */
export const NVIDIA_EMBEDDING_MODEL = "nvidia/llama-nemotron-embed-1b-v2";

export const EMBEDDING_DIMENSION = 2048;
