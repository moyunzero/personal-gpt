import { beforeEach, describe, expect, it, vi } from "vitest";

const searchMock = vi.fn();
const createVectorStoreMock = vi.fn(() => ({ search: searchMock }));

vi.mock("@personal-gpt/shared/stores/vector-store.astra", () => ({
  createVectorStore: () => createVectorStoreMock(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    ASTRA_DB_COLLECTION: "test-collection",
    OPENROUTER_API_KEY: "test-key",
    VECTOR_SEARCH_TIMEOUT_MS: 5000,
    EMBEDDING_CACHE_SIZE: 100,
  },
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    embeddings = {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      }),
    };
  },
}));

import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import { getRelevantContext } from "./retrieve";

describe("getRelevantContext", () => {
  beforeEach(() => {
    searchMock.mockReset();
    createVectorStoreMock.mockClear();
  });

  it("searches via VectorStore with default workspaceId", async () => {
    searchMock.mockResolvedValue([
      {
        text: "心晴 MO 是一款情绪记录应用",
        similarity: 0.9,
        source: "legacy-prompt-suggestion",
        title: "心晴MO",
      },
    ]);

    const result = await getRelevantContext("介绍一下心晴 MO 项目", "req-1");

    expect(createVectorStoreMock).toHaveBeenCalled();
    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: DEFAULT_WORKSPACE_ID }),
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.docCount).toBe(1);
      expect(result.blocks).toContain("心晴 MO");
    }
  });

  it("accepts explicit workspaceId override", async () => {
    searchMock.mockResolvedValue([]);
    const customWorkspace = "11111111-1111-4111-8111-111111111111";

    await getRelevantContext("任意问题", "req-2", customWorkspace);

    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: customWorkspace }),
    );
  });

  it("throws when workspaceId is missing", async () => {
    await expect(getRelevantContext("任意问题", "req-3", "")).rejects.toThrow(
      /workspaceId/,
    );
  });

  it("returns no-docs when top1 similarity is below pre-check threshold", async () => {
    searchMock.mockResolvedValue([
      {
        text: "弱相关段落",
        similarity: 0.5,
        source: "legacy",
        title: "弱命中",
      },
    ]);

    const result = await getRelevantContext("介绍一下某个项目背景", "req-4");

    expect(result.kind).toBe("no-docs");
  });
});
