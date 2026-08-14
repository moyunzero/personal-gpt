/**
 * chat-model.provider 单测：默认模型与 provider 解析。
 */
import { afterEach, describe, expect, it } from "vitest";

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
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
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
