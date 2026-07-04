/**
 * Groq 聊天主模型（免费层配额宽裕）。
 * 注册：https://console.groq.com — 无需绑卡。
 */

/** 主模型 → 质量兜底 → 高配额兜底（中文优先 Qwen） */
export const GROQ_CHAT_MODELS = [
  "qwen/qwen3-32b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
] as const;

/** HyDE / Multi-Query / LLM 路由等轻量 RAG 辅助；8B 配额最高（14400 RPD） */
export const GROQ_RAG_HELPER_MODEL = "llama-3.1-8b-instant";
