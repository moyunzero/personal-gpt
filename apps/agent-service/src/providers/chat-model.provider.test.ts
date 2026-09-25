/**
 * chat-model.provider 单测：默认模型与 provider 解析。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CEREBRAS_MODEL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_OPENAI_MODEL,
  createChatModel,
  resolveAgentProvider,
} from "./chat-model.provider";

describe("chat-model.provider", () => {
  const prev = {
    AGENT_PROVIDER: process.env.AGENT_PROVIDER,
    AGENT_MODEL: process.env.AGENT_MODEL,
    CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    CHAT_PROVIDER: process.env.CHAT_PROVIDER,
    GATEWAY_BASE_URL: process.env.GATEWAY_BASE_URL,
    GATEWAY_API_KEY: process.env.GATEWAY_API_KEY,
  };

  let logSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    logSpy?.mockRestore();
    logSpy = undefined;
  });

  it("resolveAgentProvider prefers AGENT_PROVIDER", () => {
    process.env.AGENT_PROVIDER = "openai";
    process.env.CEREBRAS_API_KEY = "c";
    process.env.GROQ_API_KEY = "g";
    expect(resolveAgentProvider()).toBe("openai");
  });

  it("throws on nonempty invalid AGENT_PROVIDER before key fallback", () => {
    process.env.AGENT_PROVIDER = "anthropic";
    process.env.GROQ_API_KEY = "g";
    expect(() => resolveAgentProvider()).toThrow(/Invalid AGENT_PROVIDER/i);
  });

  it("openai branch defaults to DEFAULT_OPENAI_MODEL not Groq model", () => {
    delete process.env.AGENT_MODEL;
    process.env.AGENT_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    const model = createChatModel();
    expect((model as { model: string }).model).toBe(DEFAULT_OPENAI_MODEL);
    expect((model as { model: string }).model).not.toBe(DEFAULT_GROQ_MODEL);
  });

  it("AGENT_MODEL wins over the provider default", () => {
    const model = createChatModel({}, {
      AGENT_PROVIDER: "cerebras",
      CEREBRAS_API_KEY: "csk",
      AGENT_MODEL: "custom-agent-model",
    } as NodeJS.ProcessEnv);
    expect((model as { model: string }).model).toBe("custom-agent-model");
  });

  it("uses the Groq agent default instead of the chat fallback list", () => {
    const model = createChatModel({}, {
      AGENT_PROVIDER: "groq",
      GROQ_API_KEY: "gsk",
    } as NodeJS.ProcessEnv);
    const modelId = (model as { model: string }).model;
    expect(modelId).toBe(DEFAULT_GROQ_MODEL);
    expect(modelId).not.toBe("qwen/qwen3.6-27b");
  });

  it("logs the selected provider and model without the apiKey", () => {
    const apiKey = "super-secret-agent-key";
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    createChatModel({}, {
      AGENT_PROVIDER: "groq",
      GROQ_API_KEY: apiKey,
      AGENT_MODEL: "openai/gpt-oss-120b",
    } as NodeJS.ProcessEnv);
    const match = logSpy.mock.calls.find(
      (args) => typeof args[0] === "string" && args[0].includes("chat model was selected"),
    );
    expect(match?.[1]).toEqual({ provider: "groq", model: "openai/gpt-oss-120b" });
    expect(JSON.stringify(match)).not.toContain(apiKey);
  });

  it("builds Cerebras when CHAT_PROVIDER is invalid", () => {
    delete process.env.AGENT_MODEL;
    process.env.AGENT_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk-agent";
    process.env.CHAT_PROVIDER = "not-a-chat-provider";
    const model = createChatModel();
    expect((model as { model: string }).model).toBe(DEFAULT_CEREBRAS_MODEL);
  });

  it("passes the gateway baseURL and the chat model id into ChatOpenAI", () => {
    const gatewayKey = "gw-secret-value-not-in-log";
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const model = createChatModel({}, {
      GATEWAY_BASE_URL: "https://gw.example/v1",
      GATEWAY_API_KEY: gatewayKey,
      CEREBRAS_API_KEY: "csk-other",
    } as NodeJS.ProcessEnv);
    expect((model as { model: string }).model).toBe("gpt-4o-mini");
    const clientConfig = (model as { clientConfig: { baseURL?: string; apiKey?: string } })
      .clientConfig;
    expect(clientConfig).toMatchObject({
      baseURL: "https://gw.example/v1",
      apiKey: gatewayKey,
    });
    const match = logSpy.mock.calls.find(
      (args) => typeof args[0] === "string" && args[0].includes("chat model was selected"),
    );
    expect(JSON.stringify(match)).not.toContain(gatewayKey);
  });

  it("omits configuration when the gateway pair and OPENAI_BASE_URL are unset", () => {
    const model = createChatModel({}, {
      AGENT_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-direct",
    } as NodeJS.ProcessEnv);
    expect(
      (model as { clientConfig: { baseURL?: string } }).clientConfig.baseURL,
    ).toBeUndefined();
  });

  it("groq / cerebras keep their defaults", () => {
    delete process.env.AGENT_MODEL;
    process.env.AGENT_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "g";
    expect((createChatModel() as { model: string }).model).toBe(DEFAULT_GROQ_MODEL);

    process.env.AGENT_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "c";
    expect((createChatModel() as { model: string }).model).toBe(DEFAULT_CEREBRAS_MODEL);
  });
});
