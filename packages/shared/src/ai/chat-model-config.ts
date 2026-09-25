/**
 * 聊天模型配置的纯数据解析：不构造 AI SDK 或 LangChain 客户端。
 * Chat 与 Agent 可以跨厂商，例如 Chat 用 Groq、Agent 用 Cerebras。
 */

import { GROQ_CHAT_MODELS } from "./groq-models";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b";
const DEFAULT_GROQ_AGENT_MODEL = "openai/gpt-oss-120b";

const MISSING_AGENT_KEY =
  "缺少聊天模型密钥：请设置 CEREBRAS_API_KEY、GROQ_API_KEY，或 OPENAI_API_KEY（可选 OPENAI_BASE_URL / AGENT_PROVIDER）";

export type ChatModelProviderId = "cerebras" | "groq" | "openai";

export type ChatModelSideName = "chat" | "agent";

export type ResolvedChatModelSide = {
  provider: ChatModelProviderId;
  name: string;
  baseURL: string;
  apiKey: string;
  models: string[];
  temperature: number;
};

export type ResolvedChatModelConfig = {
  chat: ResolvedChatModelSide | null;
  agent: ResolvedChatModelSide | null;
};

function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** Both vars must be non-empty after trim. One side, or whitespace, stays on the vendor path. */
function gatewayCredentials(
  source: NodeJS.ProcessEnv,
): { baseURL: string; apiKey: string } | null {
  const baseURL = trimmed(source.GATEWAY_BASE_URL);
  const apiKey = trimmed(source.GATEWAY_API_KEY);
  if (!baseURL || !apiKey) return null;
  return { baseURL, apiKey };
}

/** Gateway chat id: CHAT_MODEL, else the first CHAT_MODELS entry, else gpt-4o-mini. */
function gatewayChatModelId(source: NodeJS.ProcessEnv): string {
  const explicit = trimmed(source.CHAT_MODEL);
  if (explicit) return explicit;
  return parseModelList(source.CHAT_MODELS)[0] || DEFAULT_OPENAI_MODEL;
}

function gatewaySide(
  source: NodeJS.ProcessEnv,
  creds: { baseURL: string; apiKey: string },
  side: ChatModelSideName,
): ResolvedChatModelSide {
  const chatId = gatewayChatModelId(source);
  const model = side === "agent" ? trimmed(source.AGENT_MODEL) || chatId : chatId;
  return {
    provider: "openai",
    name: "openai-compatible",
    baseURL: creds.baseURL,
    apiKey: creds.apiKey,
    models: [model],
    temperature: 0,
  };
}

function parseModelList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 只解析 Chat provider id。非法别名抛错；缺 key 不抛，交给 resolveChatModelSide。 */
export function resolveChatProviderId(
  source: NodeJS.ProcessEnv = process.env,
): "groq" | "openai" | null {
  if (gatewayCredentials(source)) return "openai";
  const forced = trimmed(source.CHAT_PROVIDER).toLowerCase();
  if (forced) {
    if (forced === "groq" || forced === "openai") return forced;
    throw new Error(`Invalid CHAT_PROVIDER="${forced}". Expected groq | openai`);
  }
  if (trimmed(source.GROQ_API_KEY)) return "groq";
  if (trimmed(source.OPENAI_API_KEY)) return "openai";
  return null;
}

/** 只解析 Agent provider id。非法别名抛错；缺 key 不抛，交给 resolveAgentModelSide。 */
export function resolveAgentProviderId(
  source: NodeJS.ProcessEnv = process.env,
): ChatModelProviderId | null {
  if (gatewayCredentials(source)) return "openai";
  const forced = trimmed(source.AGENT_PROVIDER).toLowerCase();
  if (forced) {
    if (forced === "cerebras" || forced === "groq" || forced === "openai") return forced;
    throw new Error(`Invalid AGENT_PROVIDER="${forced}". Expected cerebras | groq | openai`);
  }
  if (trimmed(source.CEREBRAS_API_KEY)) return "cerebras";
  if (trimmed(source.GROQ_API_KEY)) return "groq";
  if (trimmed(source.OPENAI_API_KEY)) return "openai";
  return null;
}

function chatModels(source: NodeJS.ProcessEnv, provider: "groq" | "openai"): string[] {
  const override = parseModelList(source.CHAT_MODELS);
  if (override.length > 0) return override;
  if (provider === "openai") {
    const single =
      trimmed(source.OPENAI_CHAT_MODEL) || trimmed(source.AGENT_MODEL) || DEFAULT_OPENAI_MODEL;
    return [single];
  }
  return [...GROQ_CHAT_MODELS];
}

function agentApiKey(source: NodeJS.ProcessEnv, provider: ChatModelProviderId): string {
  if (provider === "cerebras") return trimmed(source.CEREBRAS_API_KEY);
  if (provider === "groq") return trimmed(source.GROQ_API_KEY);
  return trimmed(source.OPENAI_API_KEY);
}

function agentBaseURL(source: NodeJS.ProcessEnv, provider: ChatModelProviderId): string {
  if (provider === "cerebras")
    return trimmed(source.CEREBRAS_BASE_URL) || DEFAULT_CEREBRAS_BASE_URL;
  if (provider === "groq") return GROQ_BASE_URL;
  return trimmed(source.OPENAI_BASE_URL) || DEFAULT_OPENAI_BASE_URL;
}

function agentDefaultModel(provider: ChatModelProviderId): string {
  if (provider === "cerebras") return DEFAULT_CEREBRAS_MODEL;
  if (provider === "groq") return DEFAULT_GROQ_AGENT_MODEL;
  return DEFAULT_OPENAI_MODEL;
}

/** Chat 侧优先级：CHAT_PROVIDER，否则 GROQ_API_KEY，否则 OPENAI_API_KEY。只抛 Chat 侧错误。 */
export function resolveChatModelSide(
  source: NodeJS.ProcessEnv = process.env,
): ResolvedChatModelSide | null {
  const gateway = gatewayCredentials(source);
  if (gateway) return gatewaySide(source, gateway, "chat");

  const provider = resolveChatProviderId(source);
  if (!provider) return null;

  const apiKey =
    provider === "groq" ? trimmed(source.GROQ_API_KEY) : trimmed(source.OPENAI_API_KEY);
  if (!apiKey) {
    const envKey = provider === "groq" ? "GROQ_API_KEY" : "OPENAI_API_KEY";
    throw new Error(`CHAT_PROVIDER=${provider} 但未设置 ${envKey}`);
  }

  return {
    provider,
    name: provider === "groq" ? "groq" : "openai-compatible",
    baseURL:
      provider === "groq"
        ? GROQ_BASE_URL
        : trimmed(source.OPENAI_BASE_URL) || DEFAULT_OPENAI_BASE_URL,
    apiKey,
    models: chatModels(source, provider),
    temperature: 0,
  };
}

/** Agent 侧优先级：AGENT_PROVIDER，否则 CEREBRAS、GROQ、OPENAI。只抛 Agent 侧错误。 */
export function resolveAgentModelSide(
  source: NodeJS.ProcessEnv = process.env,
): ResolvedChatModelSide | null {
  const gateway = gatewayCredentials(source);
  if (gateway) return gatewaySide(source, gateway, "agent");

  const provider = resolveAgentProviderId(source);
  if (!provider) throw new Error(MISSING_AGENT_KEY);

  const apiKey = agentApiKey(source, provider);
  if (!apiKey) {
    const envKey =
      provider === "cerebras"
        ? "CEREBRAS_API_KEY"
        : provider === "groq"
          ? "GROQ_API_KEY"
          : "OPENAI_API_KEY";
    throw new Error(`AGENT_PROVIDER=${provider} 但未设置 ${envKey}`);
  }

  return {
    provider,
    name: provider === "openai" ? "openai-compatible" : provider,
    baseURL: agentBaseURL(source, provider),
    apiKey,
    models: [trimmed(source.AGENT_MODEL) || agentDefaultModel(provider)],
    temperature: 0,
  };
}

function baseUrlEnvKey(provider: ChatModelProviderId): string | null {
  if (provider === "cerebras") return "CEREBRAS_BASE_URL";
  if (provider === "openai") return "OPENAI_BASE_URL";
  return null;
}

function apiKeyEnvKey(provider: ChatModelProviderId): string {
  if (provider === "cerebras") return "CEREBRAS_API_KEY";
  if (provider === "groq") return "GROQ_API_KEY";
  return "OPENAI_API_KEY";
}

/**
 * 同一 provider 的 baseURL / apiKey 不一致时抛错。
 * 错误只写环境变量名；baseURL 字符串可以出现，apiKey 明文不可以。
 */
export function assertSameProviderCredentials(
  chat: ResolvedChatModelSide | null,
  agent: ResolvedChatModelSide | null,
): void {
  if (!chat || !agent) return;
  if (chat.provider !== agent.provider) return;

  if (chat.baseURL !== agent.baseURL) {
    const envKey = baseUrlEnvKey(chat.provider) ?? "baseURL";
    throw new Error(
      `Same-provider baseURL mismatch for ${chat.provider}: Chat ${envKey} (${chat.baseURL}) vs Agent ${envKey} (${agent.baseURL})`,
    );
  }

  if (chat.apiKey !== agent.apiKey) {
    const envKey = apiKeyEnvKey(chat.provider);
    throw new Error(
      `Same-provider apiKey mismatch for ${chat.provider}: Chat ${envKey} vs Agent ${envKey}`,
    );
  }
}

function otherSideOrNull(
  source: NodeJS.ProcessEnv,
  side: ChatModelSideName,
): ResolvedChatModelSide | null {
  try {
    return side === "chat" ? resolveChatModelSide(source) : resolveAgentModelSide(source);
  } catch {
    return null;
  }
}

/**
 * 只用 requested side 的抛错函数。另一侧失败记为 null，双方都非空时才核对凭证。
 * side 没有默认值：漏传不能通过类型检查。
 */
export function resolveChatModelConfig(
  source: NodeJS.ProcessEnv = process.env,
  side: ChatModelSideName,
): ResolvedChatModelConfig {
  const requested = side === "chat" ? resolveChatModelSide(source) : resolveAgentModelSide(source);
  const chat = side === "chat" ? requested : otherSideOrNull(source, "chat");
  const agent = side === "agent" ? requested : otherSideOrNull(source, "agent");
  if (chat && agent) assertSameProviderCredentials(chat, agent);
  return { chat, agent };
}
