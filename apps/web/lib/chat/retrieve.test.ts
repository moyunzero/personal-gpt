import { beforeEach, describe, expect, it, vi } from "vitest";

const hybridSearchMock = vi.fn();

vi.mock("@personal-gpt/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@personal-gpt/shared")>();
  return {
    ...actual,
    hybridSearch: (...args: unknown[]) => hybridSearchMock(...args),
  };
});

vi.mock("@/lib/env", () => ({
  env: {
    ASTRA_DB_COLLECTION: "test-collection",
    VECTOR_SEARCH_TIMEOUT_MS: 5000,
    EMBEDDING_CACHE_SIZE: 100,
  },
}));

import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import { getRelevantContext } from "./retrieve";

describe("getRelevantContext", () => {
  beforeEach(() => {
    hybridSearchMock.mockReset();
  });

  it("searches via shared hybridSearch with default workspaceId and corpus=user", async () => {
    hybridSearchMock.mockResolvedValueOnce([
      {
        text: "心晴 MO 是一款情绪记录应用",
        similarity: 0.9,
        source: "legacy-prompt-suggestion",
        title: "心晴MO",
        documentId: "doc-1",
        chunkIndex: 0,
      },
    ]);

    const result = await getRelevantContext("介绍一下心晴 MO 项目", "req-1");

    expect(hybridSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: DEFAULT_WORKSPACE_ID,
        corpus: "user",
        query: "介绍一下心晴 MO 项目",
      }),
      expect.any(Object),
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.docCount).toBe(1);
      expect(result.blocks).toContain("心晴 MO");
    }
  });

  it("accepts explicit workspaceId and corpus=seed", async () => {
    hybridSearchMock.mockResolvedValue([]);
    const customWorkspace = "11111111-1111-4111-8111-111111111111";

    await getRelevantContext("任意问题", "req-2", customWorkspace, { corpus: "seed" });

    expect(hybridSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: customWorkspace, corpus: "seed" }),
      expect.any(Object),
    );
    expect(hybridSearchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when workspaceId is missing", async () => {
    await expect(getRelevantContext("任意问题", "req-3", "")).rejects.toThrow(/workspaceId/);
  });

  it("returns no-docs when top1 similarity is below pre-check threshold", async () => {
    hybridSearchMock.mockResolvedValueOnce([
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
