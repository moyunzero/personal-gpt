/**
 * 共享聊天模型配置：注入 env，不读 ambient process.env。
 */
import { describe, expect, it } from "vitest";

import {
  assertSameProviderCredentials,
  resolveChatModelConfig,
  type ResolvedChatModelSide,
} from "./chat-model-config";

function side(
  partial: Pick<ResolvedChatModelSide, "provider" | "baseURL" | "apiKey"> &
    Partial<ResolvedChatModelSide>,
): ResolvedChatModelSide {
  return {
    name: partial.provider,
    models: ["m"],
    temperature: 0,
    ...partial,
  };
}

describe("chat-model-config", () => {
  it("throws when the same provider has different baseURL values", () => {
    const chatUrl = "https://chat.example/v1";
    const agentUrl = "https://agent.example/v1";
    expect(() =>
      assertSameProviderCredentials(
        side({ provider: "openai", baseURL: chatUrl, apiKey: "shared-key" }),
        side({ provider: "openai", baseURL: agentUrl, apiKey: "shared-key" }),
      ),
    ).toThrow(/OPENAI_BASE_URL/);

    try {
      assertSameProviderCredentials(
        side({ provider: "openai", baseURL: chatUrl, apiKey: "shared-key" }),
        side({ provider: "openai", baseURL: agentUrl, apiKey: "shared-key" }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message.split("OPENAI_BASE_URL").length - 1).toBe(2);
      expect(message).toContain(chatUrl);
      expect(message).toContain(agentUrl);
    }
  });

  it("throws when the same provider has different apiKeys and omits the secrets", () => {
    const chatSecret = "sk-chat-secret-value";
    const agentSecret = "sk-agent-secret-value";
    const groqBase = "https://api.groq.com/openai/v1";

    expect(() =>
      assertSameProviderCredentials(
        side({ provider: "groq", baseURL: groqBase, apiKey: chatSecret }),
        side({ provider: "groq", baseURL: groqBase, apiKey: agentSecret }),
      ),
    ).toThrow(/GROQ_API_KEY/);

    try {
      assertSameProviderCredentials(
        side({ provider: "groq", baseURL: groqBase, apiKey: chatSecret }),
        side({ provider: "groq", baseURL: groqBase, apiKey: agentSecret }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toContain("GROQ_API_KEY");
      expect(message).not.toContain(chatSecret);
      expect(message).not.toContain(agentSecret);
    }
  });

  it("allows Chat on Groq and Agent on Cerebras", () => {
    const resolved = resolveChatModelConfig(
      {
        CHAT_PROVIDER: "groq",
        GROQ_API_KEY: "gsk-chat",
        AGENT_PROVIDER: "cerebras",
        CEREBRAS_API_KEY: "csk-agent",
      } as NodeJS.ProcessEnv,
      "chat",
    );
    expect(resolved.chat?.provider).toBe("groq");
    expect(resolved.agent?.provider).toBe("cerebras");
  });

  it("allows different CHAT_MODELS and AGENT_MODEL lists", () => {
    const resolved = resolveChatModelConfig(
      {
        CHAT_PROVIDER: "groq",
        GROQ_API_KEY: "gsk-shared",
        CHAT_MODELS: "model-a, model-b",
        AGENT_PROVIDER: "groq",
        AGENT_MODEL: "agent-only-model",
      } as NodeJS.ProcessEnv,
      "agent",
    );
    expect(resolved.chat?.models).toEqual(["model-a", "model-b"]);
    expect(resolved.agent?.models).toEqual(["agent-only-model"]);
  });

  it("returns the Groq chat side when the agent alias is broken", () => {
    const resolved = resolveChatModelConfig(
      {
        CHAT_PROVIDER: "groq",
        GROQ_API_KEY: "gsk-chat",
        AGENT_PROVIDER: "not-a-provider",
      } as NodeJS.ProcessEnv,
      "chat",
    );
    expect(resolved.chat).toMatchObject({ provider: "groq", apiKey: "gsk-chat" });
    expect(resolved.agent).toBeNull();
  });

  it("returns the Cerebras agent side when CHAT_PROVIDER is invalid", () => {
    const resolved = resolveChatModelConfig(
      {
        CHAT_PROVIDER: "anthropic",
        AGENT_PROVIDER: "cerebras",
        CEREBRAS_API_KEY: "csk-agent",
      } as NodeJS.ProcessEnv,
      "agent",
    );
    expect(resolved.agent).toMatchObject({
      provider: "cerebras",
      apiKey: "csk-agent",
      models: ["gpt-oss-120b"],
    });
    expect(resolved.chat).toBeNull();
  });

  const gatewayUrl = "https://gateway.example/v1";
  const gatewayKey = "gw-secret-value-not-in-errors";

  function gatewaySource(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
      GATEWAY_BASE_URL: gatewayUrl,
      GATEWAY_API_KEY: gatewayKey,
      GROQ_API_KEY: "gsk-chat-different",
      CEREBRAS_API_KEY: "csk-agent-different",
      CHAT_PROVIDER: "not-a-chat-provider",
      AGENT_PROVIDER: "not-an-agent-provider",
      ...extra,
    } as NodeJS.ProcessEnv;
  }

  it("uses the gateway URL and key for both sides when the pair is set", () => {
    for (const side of ["chat", "agent"] as const) {
      const resolved = resolveChatModelConfig(gatewaySource(), side);
      expect(resolved.chat).toMatchObject({
        provider: "openai",
        name: "openai-compatible",
        baseURL: gatewayUrl,
        apiKey: gatewayKey,
      });
      expect(resolved.agent).toMatchObject({
        provider: "openai",
        name: "openai-compatible",
        baseURL: gatewayUrl,
        apiKey: gatewayKey,
      });
      expect(resolved.chat?.apiKey).not.toBe("gsk-chat-different");
      expect(resolved.agent?.apiKey).not.toBe("csk-agent-different");
    }
  });

  it("picks the chat gateway id as CHAT_MODEL, else the first CHAT_MODELS entry, else gpt-4o-mini", () => {
    const named = resolveChatModelConfig(
      gatewaySource({ CHAT_MODEL: "named-chat", CHAT_MODELS: "first-list, second-list" }),
      "chat",
    );
    expect(named.chat?.models).toEqual(["named-chat"]);

    const listed = resolveChatModelConfig(
      gatewaySource({ CHAT_MODELS: "first-list, second-list" }),
      "chat",
    );
    expect(listed.chat?.models).toEqual(["first-list"]);

    const fallback = resolveChatModelConfig(gatewaySource(), "chat");
    expect(fallback.chat?.models).toEqual(["gpt-4o-mini"]);
  });

  it("keeps Agent to one model: AGENT_MODEL, else the chat gateway id", () => {
    const named = resolveChatModelConfig(
      gatewaySource({ CHAT_MODEL: "named-chat", AGENT_MODEL: "named-agent" }),
      "agent",
    );
    expect(named.agent?.models).toEqual(["named-agent"]);
    expect(named.chat?.models).toEqual(["named-chat"]);

    const fallback = resolveChatModelConfig(gatewaySource({ CHAT_MODEL: "named-chat" }), "agent");
    expect(fallback.agent?.models).toEqual(["named-chat"]);
    expect(fallback.agent?.models).toHaveLength(1);
  });

  it("keeps Groq chat and Cerebras agent when only GATEWAY_API_KEY is set", () => {
    const resolved = resolveChatModelConfig(
      {
        GATEWAY_API_KEY: gatewayKey,
        CHAT_PROVIDER: "groq",
        GROQ_API_KEY: "gsk-chat",
        AGENT_PROVIDER: "cerebras",
        CEREBRAS_API_KEY: "csk-agent",
      } as NodeJS.ProcessEnv,
      "chat",
    );
    expect(resolved.chat?.provider).toBe("groq");
    expect(resolved.chat?.apiKey).toBe("gsk-chat");
    expect(resolved.agent?.provider).toBe("cerebras");
    expect(resolved.agent?.apiKey).toBe("csk-agent");
  });

  it("treats a whitespace gateway URL as unset", () => {
    const resolved = resolveChatModelConfig(
      {
        GATEWAY_BASE_URL: "   ",
        GATEWAY_API_KEY: gatewayKey,
        CHAT_PROVIDER: "groq",
        GROQ_API_KEY: "gsk-chat",
        AGENT_PROVIDER: "cerebras",
        CEREBRAS_API_KEY: "csk-agent",
      } as NodeJS.ProcessEnv,
      "agent",
    );
    expect(resolved.chat?.provider).toBe("groq");
    expect(resolved.agent?.provider).toBe("cerebras");
  });

  it("omits the gateway key from a thrown chat-side error", () => {
    expect(() =>
      resolveChatModelConfig(
        {
          GATEWAY_API_KEY: gatewayKey,
          CHAT_PROVIDER: "anthropic",
        } as NodeJS.ProcessEnv,
        "chat",
      ),
    ).toThrow(/Invalid CHAT_PROVIDER/);

    try {
      resolveChatModelConfig(
        {
          GATEWAY_API_KEY: gatewayKey,
          CHAT_PROVIDER: "anthropic",
        } as NodeJS.ProcessEnv,
        "chat",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).not.toContain(gatewayKey);
    }
  });
});
