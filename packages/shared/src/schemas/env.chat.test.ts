/**
 * SharedEnv：GROQ / OPENAI 二选一与 CHAT_PROVIDER 校验。
 */
import { describe, expect, it } from "vitest";

import { parseSharedEnv } from "../schemas/env";

const base = {
  ASTRA_DB_COLLECTION: "col",
  ASTRA_DB_API_ENDPOINT: "https://example.apps.astra.datastax.com",
  ASTRA_DB_APPLICATION_TOKEN: "AstraCS:test",
  NIM_API_KEY: "nvapi-test",
};

describe("parseSharedEnv chat keys", () => {
  it("accepts GROQ-only", () => {
    const env = parseSharedEnv({ ...base, GROQ_API_KEY: "gsk" } as NodeJS.ProcessEnv);
    expect(env.GROQ_API_KEY).toBe("gsk");
  });

  it("accepts OPENAI-only with CHAT_PROVIDER=openai", () => {
    const env = parseSharedEnv({
      ...base,
      CHAT_PROVIDER: "openai",
      OPENAI_API_KEY: "sk",
      OPENAI_BASE_URL: "https://gateway.example/v1",
    } as NodeJS.ProcessEnv);
    expect(env.CHAT_PROVIDER).toBe("openai");
    expect(env.OPENAI_BASE_URL).toBe("https://gateway.example/v1");
  });

  it("rejects when neither GROQ nor OPENAI set", () => {
    expect(() => parseSharedEnv({ ...base } as NodeJS.ProcessEnv)).toThrow(
      /GROQ_API_KEY|OPENAI_API_KEY/,
    );
  });

  it("rejects CHAT_PROVIDER=openai without OPENAI_API_KEY", () => {
    expect(() =>
      parseSharedEnv({
        ...base,
        GROQ_API_KEY: "gsk",
        CHAT_PROVIDER: "openai",
      } as NodeJS.ProcessEnv),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("allows milvus-only without Astra credentials", () => {
    const env = parseSharedEnv({
      ...base,
      GROQ_API_KEY: "gsk",
      VECTOR_BACKEND: "milvus",
      ASTRA_DB_COLLECTION: undefined,
      ASTRA_DB_API_ENDPOINT: undefined,
      ASTRA_DB_APPLICATION_TOKEN: undefined,
    } as NodeJS.ProcessEnv);
    expect(env.VECTOR_BACKEND).toBe("milvus");
  });

  it("requires Astra credentials when VECTOR_BACKEND=astra", () => {
    expect(() =>
      parseSharedEnv({
        GROQ_API_KEY: "gsk",
        NIM_API_KEY: "nvapi-test",
        VECTOR_BACKEND: "astra",
      } as NodeJS.ProcessEnv),
    ).toThrow(/ASTRA_DB_COLLECTION/);
  });
});
