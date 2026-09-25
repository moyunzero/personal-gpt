/**
 * LangChain ChatOpenAI provider（Groq / Cerebras / OpenAI 兼容 baseURL）。
 * 缺 key 时抛出明确错误，供 Nest 层处理；LangSmith 经 LANGSMITH_* fail-open（D-00e/D-18）。
 */

import { ChatOpenAI } from "@langchain/openai";
import {
  resolveAgentProviderId,
  resolveChatModelConfig,
} from "@personal-gpt/shared/ai/chat-model-config";

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export type CreateChatModelOptions = {
  model?: string;
  temperature?: number;
};

export type AgentProvider = "cerebras" | "groq" | "openai";

/** 解析 provider：AGENT_PROVIDER 优先；非法非空值直接抛错；缺 key 不抛。不读 CHAT_PROVIDER。 */
export function resolveAgentProvider(
  source: NodeJS.ProcessEnv = process.env,
): AgentProvider | null {
  return resolveAgentProviderId(source);
}

/**
 * 构造 ChatOpenAI。
 * - AGENT_PROVIDER=cerebras|groq|openai 可强制切换
 * - 未指定时优先 CEREBRAS_API_KEY，其次 GROQ，再次 OPENAI（+ 可选 OPENAI_BASE_URL）
 */
export function createChatModel(
  options: CreateChatModelOptions = {},
  source: NodeJS.ProcessEnv = process.env,
): ChatOpenAI {
  const { agent } = resolveChatModelConfig(source, "agent");
  if (!agent) {
    throw new Error(
      "缺少聊天模型密钥：请设置 CEREBRAS_API_KEY、GROQ_API_KEY，或 OPENAI_API_KEY（可选 OPENAI_BASE_URL / AGENT_PROVIDER）",
    );
  }

  const model = options.model ?? (source.AGENT_MODEL?.trim() || agent.models[0]);
  const temperature = options.temperature ?? agent.temperature;
  console.log("chat model was selected", { provider: agent.provider, model });

  if (agent.provider === "openai") {
    const openaiBase = source.OPENAI_BASE_URL?.trim();
    return new ChatOpenAI({
      model,
      apiKey: agent.apiKey,
      temperature,
      ...(openaiBase ? { configuration: { baseURL: openaiBase } } : {}),
    });
  }

  return new ChatOpenAI({
    model,
    apiKey: agent.apiKey,
    temperature,
    configuration: { baseURL: agent.baseURL },
  });
}
