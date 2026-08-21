import { beforeEach, describe, expect, it, vi } from "vitest";

const embedTextMock = vi.fn();
const searchMock = vi.fn();

vi.mock("@personal-gpt/shared/ai/embeddings", () => ({
  embedText: (...args: unknown[]) => embedTextMock(...args),
}));

vi.mock("@personal-gpt/shared/stores/vector-store.astra", () => ({
  createVectorStore: () => ({ search: searchMock }),
}));

vi.mock("@/lib/env", () => ({
  env: { EMBEDDING_CACHE_SIZE: 10 },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      metric: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

describe("embedding fail-open", () => {
  beforeEach(() => {
    embedTextMock.mockReset();
    searchMock.mockReset();
    vi.resetModules();
  });

  it("embedQueryText returns null when NIM throws", async () => {
    embedTextMock.mockRejectedValueOnce(new Error("other side closed"));
    const { embedQueryText } = await import("./embedding-service");
    const log = {
      metric: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    await expect(embedQueryText("介绍一下 MoCode", log as never)).resolves.toBeNull();
    expect(log.warn).toHaveBeenCalled();
  });

  it("probeKbRelevance returns probed:false when Astra search throws", async () => {
    embedTextMock.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    searchMock.mockRejectedValueOnce(new Error("other side closed"));
    const { probeKbRelevance } = await import("./embedding-precheck");
    await expect(probeKbRelevance("介绍一下 MoCode")).resolves.toEqual({
      topSimilarity: 0,
      probed: false,
    });
  });
});
