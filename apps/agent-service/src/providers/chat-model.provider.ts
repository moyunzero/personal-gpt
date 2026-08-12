/**
 * LangChain ChatOpenAI provider（Groq / OpenAI 兼容 baseURL）。
 * 缺 key 时抛出明确错误，供 Nest 层处理；LangSmith 经 LANGSMITH_* fail-open（D-00e/D-18）。
 */

import { ChatOpenAI } from "@langchain/openai";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export type CreateChatModelOptions = {
  model?: string;
  temperature?: number;
};

/**
 * 构造 ChatOpenAI。优先 GROQ_API_KEY + Groq baseURL；
 * 也可 OPENAI_API_KEY + 可选 OPENAI_BASE_URL。
 */
export function createChatModel(
  options: CreateChatModelOptions = {},
): ChatOpenAI {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const openaiBase = process.env.OPENAI_BASE_URL?.trim();

  if (groqKey) {
    return new ChatOpenAI({
      model: options.model ?? process.env.AGENT_MODEL ?? DEFAULT_MODEL,
      apiKey: groqKey,
      temperature: options.temperature ?? 0,
      configuration: { baseURL: GROQ_BASE_URL },
    });
  }

  if (openaiKey) {
    return new ChatOpenAI({
      model: options.model ?? process.env.AGENT_MODEL ?? DEFAULT_MODEL,
      apiKey: openaiKey,
      temperature: options.temperature ?? 0,
      ...(openaiBase
        ? { configuration: { baseURL: openaiBase } }
        : {}),
    });
  }

  throw new Error(
    "缺少聊天模型密钥：请设置 GROQ_API_KEY，或 OPENAI_API_KEY（可选 OPENAI_BASE_URL）",
  );
}
