/**
 * Corrective: top1 below CORRECTIVE_MIN_SCORE → rewrite once + reSearch; never twice (D-33/D-34).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RetrievedChunk } from "../stores/vector-store";
import { maybeCorrective, needsCorrectiveRewrite } from "./corrective";

const lowHit: RetrievedChunk = {
  text: "weak",
  similarity: 0.1,
  documentId: "d1",
  chunkIndex: 0,
};

const highHit: RetrievedChunk = {
  text: "strong",
  similarity: 0.9,
  documentId: "d2",
  chunkIndex: 0,
};

describe("needsCorrectiveRewrite", () => {
  it("is true when top1 similarity is below threshold", () => {
    expect(needsCorrectiveRewrite([lowHit], 0.35)).toBe(true);
  });

  it("is false when top1 similarity meets threshold", () => {
    expect(needsCorrectiveRewrite([highHit], 0.35)).toBe(false);
  });

  it("is true when hits are empty", () => {
    expect(needsCorrectiveRewrite([], 0.35)).toBe(true);
  });
});

describe("maybeCorrective", () => {
  const prev = process.env.CORRECTIVE_MIN_SCORE;

  afterEach(() => {
    if (prev === undefined) delete process.env.CORRECTIVE_MIN_SCORE;
    else process.env.CORRECTIVE_MIN_SCORE = prev;
  });

  it("does not rewrite when top1 is above threshold", async () => {
    process.env.CORRECTIVE_MIN_SCORE = "0.35";
    const rewrite = vi.fn(async () => "rewritten");
    const reSearch = vi.fn(async () => [highHit]);

    const out = await maybeCorrective({ query: "original", workspaceId: "ws-1" }, [highHit], {
      rewrite,
      reSearch,
      minScore: 0.35,
    });

    expect(rewrite).not.toHaveBeenCalled();
    expect(reSearch).not.toHaveBeenCalled();
    expect(out).toEqual([highHit]);
  });

  it("rewrites at most once then re-searches (D-33)", async () => {
    process.env.CORRECTIVE_MIN_SCORE = "0.35";
    const rewrite = vi.fn(async () => "rewritten once");
    const better: RetrievedChunk = {
      text: "better",
      similarity: 0.2,
      documentId: "d3",
      chunkIndex: 0,
    };
    const reSearch = vi.fn(async () => [better]);

    const out = await maybeCorrective({ query: "vague question", workspaceId: "ws-1" }, [lowHit], {
      rewrite,
      reSearch,
      minScore: 0.35,
    });

    expect(rewrite).toHaveBeenCalledTimes(1);
    expect(rewrite).toHaveBeenCalledWith("vague question");
    expect(reSearch).toHaveBeenCalledTimes(1);
    expect(reSearch).toHaveBeenCalledWith("rewritten once");
    expect(out).toEqual([better]);
  });

  it("skips rewrite when alreadyCorrected (second hybrid pass)", async () => {
    const rewrite = vi.fn(async () => "again");
    const reSearch = vi.fn(async () => [highHit]);

    const out = await maybeCorrective({ query: "q", workspaceId: "ws-1" }, [lowHit], {
      rewrite,
      reSearch,
      minScore: 0.35,
      alreadyCorrected: true,
    });

    expect(rewrite).not.toHaveBeenCalled();
    expect(reSearch).not.toHaveBeenCalled();
    expect(out).toEqual([lowHit]);
  });
});
