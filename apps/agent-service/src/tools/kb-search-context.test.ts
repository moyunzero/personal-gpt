/**
 * kb-search-context 容量上限。
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_KB_SEARCH_THREAD_CONTEXTS,
  clearAllKbSearchContextsForTests,
  clearKbSearchContextForThread,
  getKbSearchContextForThread,
  kbSearchContextSizeForTests,
  setKbSearchContextForThread,
} from "./kb-search-context";

describe("kb-search-context", () => {
  afterEach(() => {
    clearAllKbSearchContextsForTests();
  });

  it("get/set/clear round-trip", () => {
    setKbSearchContextForThread("t1", { userText: "hi", workspaceId: "w1" });
    expect(getKbSearchContextForThread("t1")).toEqual({ userText: "hi", workspaceId: "w1" });
    clearKbSearchContextForThread("t1");
    expect(getKbSearchContextForThread("t1")).toEqual({});
  });

  it("evicts oldest when over cap", () => {
    for (let i = 0; i < MAX_KB_SEARCH_THREAD_CONTEXTS; i++) {
      setKbSearchContextForThread(`t-${i}`, { userText: `u${i}` });
    }
    expect(kbSearchContextSizeForTests()).toBe(MAX_KB_SEARCH_THREAD_CONTEXTS);
    setKbSearchContextForThread("t-new", { userText: "new" });
    expect(kbSearchContextSizeForTests()).toBe(MAX_KB_SEARCH_THREAD_CONTEXTS);
    expect(getKbSearchContextForThread("t-0")).toEqual({});
    expect(getKbSearchContextForThread("t-new").userText).toBe("new");
  });
});
