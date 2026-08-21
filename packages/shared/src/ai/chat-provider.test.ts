/**
 * Chat provider 解析与模型列表单测（无 live API）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { GROQ_CHAT_MODELS, GROQ_RAG_HELPER_MODEL } from "./groq-models";
import {
  chatModel,
  resetChatProviderCache,
  resolveChatModels,
  resolveChatProvider,
  resolveChatProviderConfig,
  resolveRagHelperModel,
} from "./chat-provider";

describe("chat-provider", () => {
  afterEach(() => {
    resetChatProviderCache();
    vi.unstubAllEnvs();
  });

  it("resolveChatProvider prefers CHAT_PROVIDER over keys", () => {
    vi.stubEnv("CHAT_PROVIDER", "openai");
    vi.stubEnv("GROQ_API_KEY", "gsk");
    vi.stubEnv("OPENAI_API_KEY", "sk");
    expect(resolveChatProvider()).toBe("openai");
  });

  it("throws on invalid CHAT_PROVIDER", () => {
    vi.stubEnv("CHAT_PROVIDER", "anthropic");
    expect(() => resolveChatProvider()).toThrow(/Invalid CHAT_PROVIDER/i);
  });

  it("falls back groq then openai when CHAT_PROVIDER unset", () => {
    vi.stubEnv("GROQ_API_KEY", "gsk");
    expect(resolveChatProvider()).toBe("groq");

    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "sk");
    expect(resolveChatProvider()).toBe("openai");
  });

  it("resolveChatProviderConfig uses Groq baseURL", () => {
    vi.stubEnv("CHAT_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk-test");
    expect(resolveChatProviderConfig()).toMatchObject({
      provider: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: "gsk-test",
    });
  });

  it("resolveChatProviderConfig uses OPENAI_BASE_URL for gateway", () => {
    vi.stubEnv("CHAT_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk-gateway");
    vi.stubEnv("OPENAI_BASE_URL", "https://gateway.example/v1");
    expect(resolveChatProviderConfig()).toMatchObject({
      provider: "openai",
      name: "openai-compatible",
      baseURL: "https://gateway.example/v1",
      apiKey: "sk-gateway",
    });
  });

  it("resolveChatModels: groq defaults + CHAT_MODELS override", () => {
    vi.stubEnv("GROQ_API_KEY", "gsk");
    expect(resolveChatModels()).toEqual([...GROQ_CHAT_MODELS]);

    vi.stubEnv("CHAT_MODELS", "a-model, b-model");
    expect(resolveChatModels()).toEqual(["a-model", "b-model"]);
  });

  it("resolveChatModels: openai uses OPENAI_CHAT_MODEL / AGENT_MODEL", () => {
    vi.stubEnv("CHAT_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk");
    expect(resolveChatModels()).toEqual(["gpt-4o-mini"]);

    vi.stubEnv("OPENAI_CHAT_MODEL", "gpt-4o");
    expect(resolveChatModels()).toEqual(["gpt-4o"]);

    vi.stubEnv("OPENAI_CHAT_MODEL", "");
    vi.stubEnv("AGENT_MODEL", "custom-gateway-model");
    expect(resolveChatModels()).toEqual(["custom-gateway-model"]);
  });

  it("resolveRagHelperModel: groq 8B vs openai first model", () => {
    vi.stubEnv("GROQ_API_KEY", "gsk");
    expect(resolveRagHelperModel()).toBe(GROQ_RAG_HELPER_MODEL);

    vi.stubEnv("CHAT_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk");
    vi.stubEnv("CHAT_MODELS", "gateway-a,gateway-b");
    expect(resolveRagHelperModel()).toBe("gateway-a");

    vi.stubEnv("CHAT_RAG_HELPER_MODEL", "helper-x");
    expect(resolveRagHelperModel()).toBe("helper-x");
  });

  it("chatModel builds without throwing when keys present", () => {
    vi.stubEnv("CHAT_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_BASE_URL", "https://gateway.example/v1");
    const model = chatModel("gpt-4o-mini");
    expect(model).toBeTruthy();
  });
});
