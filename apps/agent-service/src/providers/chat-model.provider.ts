/**
 * LangChain ChatOpenAI provider（Groq / Cerebras / OpenAI 兼容 baseURL）。
 * 缺 key 时抛出明确错误，供 Nest 层处理；LangSmith 经 LANGSMITH_* fail-open（D-00e/D-18）。
 */

import { ChatOpenAI } from "@langchain/openai";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";

export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
export const DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export type CreateChatModelOptions = {
  model?: string;
  temperature?: number;
};

export type AgentProvider = "cerebras" | "groq" | "openai";

/** 解析 provider：AGENT_PROVIDER 优先；否则 cerebras → groq → openai */
export function resolveAgentProvider(): AgentProvider | null {
  const forced = process.env.AGENT_PROVIDER?.trim().toLowerCase();
  if (forced === "cerebras" || forced === "groq" || forced === "openai") {
    return forced;
  }
  if (process.env.CEREBRAS_API_KEY?.trim()) return "cerebras";
  if (process.env.GROQ_API_KEY?.trim()) return "groq";
  if (process.env.OPENAI_API_KEY?.trim()) return "openai";
  return null;
}

/**
 * 构造 ChatOpenAI。
 * - AGENT_PROVIDER=cerebras|groq|openai 可强制切换
 * - 未指定时优先 CEREBRAS_API_KEY，其次 GROQ，再次 OPENAI（+ 可选 OPENAI_BASE_URL）
 */
export function createChatModel(options: CreateChatModelOptions = {}): ChatOpenAI {
  const provider = resolveAgentProvider();
  const cerebrasKey = process.env.CEREBRAS_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const openaiBase = process.env.OPENAI_BASE_URL?.trim();
  const cerebrasBase = process.env.CEREBRAS_BASE_URL?.trim() || CEREBRAS_BASE_URL;

  if (provider === "cerebras") {
    if (!cerebrasKey) {
      throw new Error("AGENT_PROVIDER=cerebras 但未设置 CEREBRAS_API_KEY");
    }
    return new ChatOpenAI({
      model: options.model ?? process.env.AGENT_MODEL ?? DEFAULT_CEREBRAS_MODEL,
      apiKey: cerebrasKey,
      temperature: options.temperature ?? 0,
      configuration: { baseURL: cerebrasBase },
    });
  }

  if (provider === "groq") {
    if (!groqKey) {
      throw new Error("AGENT_PROVIDER=groq 但未设置 GROQ_API_KEY");
    }
    return new ChatOpenAI({
      model: options.model ?? process.env.AGENT_MODEL ?? DEFAULT_GROQ_MODEL,
      apiKey: groqKey,
      temperature: options.temperature ?? 0,
      configuration: { baseURL: GROQ_BASE_URL },
    });
  }

  if (provider === "openai") {
    if (!openaiKey) {
      throw new Error("AGENT_PROVIDER=openai 但未设置 OPENAI_API_KEY");
    }
    return new ChatOpenAI({
      model: options.model ?? process.env.AGENT_MODEL ?? DEFAULT_OPENAI_MODEL,
      apiKey: openaiKey,
      temperature: options.temperature ?? 0,
      ...(openaiBase ? { configuration: { baseURL: openaiBase } } : {}),
    });
  }

  throw new Error(
    "缺少聊天模型密钥：请设置 CEREBRAS_API_KEY、GROQ_API_KEY，或 OPENAI_API_KEY（可选 OPENAI_BASE_URL / AGENT_PROVIDER）",
  );
}
