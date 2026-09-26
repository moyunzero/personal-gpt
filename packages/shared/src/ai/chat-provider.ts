/**
 * Chat 主模型解析（web RAG + RAG helper）：Groq 或 OpenAI 兼容网关。
 * VPN / 地区限制时可设 CHAT_PROVIDER=openai + OPENAI_BASE_URL。
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import { resolveChatModelConfig, resolveChatProviderId } from "./chat-model-config";
import { GROQ_CHAT_MODELS, GROQ_RAG_HELPER_MODEL } from "./groq-models";

const DEFAULT_OPENAI_CHAT_MODEL = "gpt-4o-mini";

export type ChatProvider = "groq" | "openai";

export type ChatProviderConfig = {
  provider: ChatProvider;
  name: string;
  baseURL: string;
  apiKey: string;
};

/** 解析 provider：CHAT_PROVIDER 优先；否则 groq → openai。缺 key 仍返回强制 id。 */
export function resolveChatProvider(source: NodeJS.ProcessEnv = process.env): ChatProvider | null {
  return resolveChatProviderId(source);
}

/** 构造 provider 连接参数；缺 key / 非法强制值时抛错。不抛 Agent 侧错误。 */
export function resolveChatProviderConfig(
  source: NodeJS.ProcessEnv = process.env,
): ChatProviderConfig {
  const { chat } = resolveChatModelConfig(source, "chat");
  if (!chat || (chat.provider !== "groq" && chat.provider !== "openai")) {
    throw new Error(
      "缺少聊天模型密钥：请设置 GROQ_API_KEY，或 OPENAI_API_KEY（可选 OPENAI_BASE_URL / CHAT_PROVIDER）",
    );
  }
  return {
    provider: chat.provider,
    name: chat.name,
    baseURL: chat.baseURL,
    apiKey: chat.apiKey,
  };
}

function parseModelList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function gatewayPairSet(source: NodeJS.ProcessEnv): boolean {
  return Boolean(source.GATEWAY_BASE_URL?.trim() && source.GATEWAY_API_KEY?.trim());
}

/**
 * 聊天 fallback 模型列表。
 * 网关对齐全时只返回聊天侧的一个 id；否则 CHAT_MODELS 覆盖，groq 用 GROQ_CHAT_MODELS，openai 用单模型默认。
 */
export function resolveChatModels(source: NodeJS.ProcessEnv = process.env): string[] {
  if (gatewayPairSet(source)) {
    const { chat } = resolveChatModelConfig(source, "chat");
    return chat?.models ?? [];
  }

  const override = parseModelList(source.CHAT_MODELS);
  if (override.length > 0) return override;

  const provider = resolveChatProvider(source) ?? "groq";
  if (provider === "openai") {
    const single =
      source.OPENAI_CHAT_MODEL?.trim() || source.AGENT_MODEL?.trim() || DEFAULT_OPENAI_CHAT_MODEL;
    return [single];
  }
  return [...GROQ_CHAT_MODELS];
}

/** RAG 辅助（路由 / HyDE 等）模型 id */
export function resolveRagHelperModel(source: NodeJS.ProcessEnv = process.env): string {
  const override = source.CHAT_RAG_HELPER_MODEL?.trim();
  if (override) return override;
  const models = resolveChatModels(source);
  if (resolveChatProvider(source) === "openai") {
    return models[0] ?? DEFAULT_OPENAI_CHAT_MODEL;
  }
  return GROQ_RAG_HELPER_MODEL;
}

type CompatibleProvider = ReturnType<typeof createOpenAICompatible>;

let cachedKey: string | undefined;
let cachedProvider: CompatibleProvider | undefined;

function cacheKey(cfg: ChatProviderConfig): string {
  return `${cfg.provider}|${cfg.baseURL}|${cfg.apiKey}`;
}

function getCompatibleProvider(source: NodeJS.ProcessEnv = process.env): CompatibleProvider {
  const cfg = resolveChatProviderConfig(source);
  const key = cacheKey(cfg);
  if (!cachedProvider || cachedKey !== key) {
    cachedProvider = createOpenAICompatible({
      name: cfg.name,
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
    });
    cachedKey = key;
  }
  return cachedProvider;
}

/** AI SDK 聊天模型（Groq 或 OpenAI 兼容端点） */
export function chatModel(modelId: string, source: NodeJS.ProcessEnv = process.env): LanguageModel {
  return getCompatibleProvider(source).chatModel(modelId);
}

export type GraphModelEndpoint = {
  modelId: string;
  baseURL: string;
  apiKey: string;
  name?: string;
};

/**
 * 图谱抽取用的兼容端点。structuredOutputs 为 true 时才把 JSON schema 发给模型。
 * 不走聊天单例，避免把用户密钥写进环境模型缓存。
 */
export function graphLanguageModel(
  endpoint: GraphModelEndpoint,
  supportsStructuredOutputs: boolean,
): LanguageModel {
  return createOpenAICompatible({
    name: endpoint.name?.trim() || "graph",
    baseURL: endpoint.baseURL,
    apiKey: endpoint.apiKey,
    supportsStructuredOutputs,
  }).chatModel(endpoint.modelId);
}

/** @deprecated 使用 chatModel；保留别名避免现有 import 断裂 */
export function groqChatModel(
  modelId: string,
  source: NodeJS.ProcessEnv = process.env,
): LanguageModel {
  return chatModel(modelId, source);
}

/** 测试用：清空 provider 单例缓存 */
export function resetChatProviderCache(): void {
  cachedKey = undefined;
  cachedProvider = undefined;
}
