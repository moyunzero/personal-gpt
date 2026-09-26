import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeEntityName } from "./normalize-entity";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("../ai/chat-provider", () => ({
  graphLanguageModel: vi.fn((_endpoint: unknown, structured: boolean) =>
    structured ? "schema-model" : "json-model",
  ),
  resolveChatProviderConfig: vi.fn(() => ({
    provider: "groq",
    name: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: "test-key",
  })),
  resolveRagHelperModel: vi.fn(() => "openai/gpt-oss-20b"),
}));

import { generateObject, generateText } from "ai";

import { graphLanguageModel } from "../ai/chat-provider";
import {
  extractGraphFromChunk,
  extractGraphFromChunks,
  parseGraphJsonText,
  workspaceGraphEndpoint,
} from "./extract-entities";

describe("normalizeEntityName", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeEntityName("  Pearl   Milk  Tea  ")).toBe("pearl milk tea");
  });
});

describe("parseGraphJsonText", () => {
  it("reads a JSON object inside a markdown fence", () => {
    expect(
      parseGraphJsonText('```json\n{"entities":[],"relations":[]}\n```'),
    ).toEqual({ entities: [], relations: [] });
  });
});

describe("workspaceGraphEndpoint", () => {
  it("uses the saved model and falls back to the catalog base URL", () => {
    expect(
      workspaceGraphEndpoint({
        model_id: "kimi-k3",
        api_key: "secret",
        base_url: "",
      }),
    ).toMatchObject({
      modelId: "kimi-k3",
      baseURL: "https://api.moonshot.ai/v1",
    });
  });

  it("returns undefined when the key is missing", () => {
    expect(workspaceGraphEndpoint({ model_id: "kimi-k3", api_key: " ", base_url: "https://x" })).toBeUndefined();
  });
});

describe("extractGraphFromChunk", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
    vi.mocked(generateText).mockReset();
    vi.mocked(graphLanguageModel).mockClear();
  });

  it("returns entities with normalizedName derived from name", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        entities: [{ name: "  Alice  ", entityType: "person" }],
        relations: [],
      },
    } as never);

    const result = await extractGraphFromChunk("Alice works at Acme.");
    expect(result.entities[0]).toEqual({
      name: "  Alice  ",
      normalizedName: "alice",
      entityType: "person",
    });
  });

  it("uses the workspace model and falls back when schema output is rejected", async () => {
    vi.mocked(generateObject).mockRejectedValue(
      new Error("No object generated: response did not match schema."),
    );
    vi.mocked(generateText).mockResolvedValue({
      text: '```json\n{"entities":[{"name":"Acme","entityType":"org"}],"relations":[]}\n```',
    } as never);

    const result = await extractGraphFromChunk("Acme builds products.", {
      modelId: "gemini-3.8-flash",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: "user-key",
    });

    expect(graphLanguageModel).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ modelId: "gemini-3.8-flash" }),
      true,
    );
    expect(graphLanguageModel).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ modelId: "gemini-3.8-flash" }),
      false,
    );
    expect(result.entities[0]?.normalizedName).toBe("acme");
    expect(vi.mocked(generateObject).mock.calls[0]?.[0]).toMatchObject({ model: "schema-model" });
    expect(vi.mocked(generateText).mock.calls[0]?.[0]).toMatchObject({ model: "json-model" });
  });

  it("throws on LLM failure (no silent empty graph)", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("LLM down"));
    vi.mocked(generateText).mockRejectedValue(new Error("also down"));
    await expect(extractGraphFromChunk("text")).rejects.toThrow("LLM down");
  });
});

describe("extractGraphFromChunks", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
    vi.mocked(generateText).mockReset();
  });

  it("loops all chunks and dedupes entities by normalizedName+entityType", async () => {
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          entities: [{ name: "Alice", entityType: "person" }],
          relations: [{ fromName: "Alice", toName: "Acme", type: "RELATED_TO" }],
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          entities: [
            { name: "alice", entityType: "person" },
            { name: "Acme", entityType: "org" },
          ],
          relations: [{ fromName: "Alice", toName: "Acme", type: "RELATED_TO" }],
        },
      } as never);

    const result = await extractGraphFromChunks(["chunk one", "chunk two"]);
    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result.entities).toHaveLength(2);
    expect(result.entities.map((e) => e.normalizedName).sort()).toEqual(["acme", "alice"]);
    expect(result.relations).toHaveLength(1);
  });

  it("throws when any chunk extract fails", async () => {
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: { entities: [], relations: [] },
      } as never)
      .mockRejectedValueOnce(new Error("schema fail"));
    vi.mocked(generateText).mockRejectedValue(new Error("schema fail"));

    await expect(extractGraphFromChunks(["ok", "bad"])).rejects.toThrow("schema fail");
  });
});
