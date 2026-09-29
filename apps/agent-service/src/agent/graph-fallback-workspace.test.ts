import { describe, expect, it } from "vitest";

import { graphFallbackInvokeArgs } from "./graph-fallback-args";

describe("graphFallbackInvokeArgs (D-22 / FIX-S2-04)", () => {
  it("includes workspaceId matching prefetch shape", () => {
    const args = graphFallbackInvokeArgs({
      question: "珍珠奶茶有哪些原料？",
      workspaceId: "ws-tenant-1",
      documentIds: ["doc-a"],
    });
    expect(args).toEqual({
      question: "珍珠奶茶有哪些原料？",
      workspaceId: "ws-tenant-1",
      documentIds: ["doc-a"],
    });
    expect(args.workspaceId).toBeDefined();
    expect(args.workspaceId).not.toBeUndefined();
  });

  it("always passes workspaceId even when documentIds empty", () => {
    const args = graphFallbackInvokeArgs({
      question: "q",
      workspaceId: "ws-2",
      documentIds: [],
    });
    expect(args.workspaceId).toBe("ws-2");
  });
});
