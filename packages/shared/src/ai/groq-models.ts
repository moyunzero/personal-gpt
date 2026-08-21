/**
 * Groq 聊天主模型（以当前账号 /models 实际可用 id 为准）。
 * 注册：https://console.groq.com
 */

/** 主模型 → 质量兜底 → 轻量兜底（中文优先 Qwen） */
export const GROQ_CHAT_MODELS = [
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
] as const;

/** HyDE / Multi-Query / LLM 路由等轻量 RAG 辅助 */
export const GROQ_RAG_HELPER_MODEL = "openai/gpt-oss-20b";
