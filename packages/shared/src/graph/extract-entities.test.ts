import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeEntityName } from "./normalize-entity";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("../ai/chat-provider", () => ({
  chatModel: vi.fn(() => "mock-model"),
  resolveRagHelperModel: vi.fn(() => "mock-rag-model"),
}));

import { generateObject } from "ai";

import { extractGraphFromChunk, extractGraphFromChunks } from "./extract-entities";

describe("normalizeEntityName", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeEntityName("  Pearl   Milk  Tea  ")).toBe("pearl milk tea");
  });
});

describe("extractGraphFromChunk", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
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

  it("throws on LLM failure (no silent empty graph)", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("LLM down"));
    await expect(extractGraphFromChunk("text")).rejects.toThrow("LLM down");
  });
});

describe("extractGraphFromChunks", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
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

    await expect(extractGraphFromChunks(["ok", "bad"])).rejects.toThrow("schema fail");
  });
});
