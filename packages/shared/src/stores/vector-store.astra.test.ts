import { describe, expect, it } from "vitest";

import { mapAstraDoc } from "./vector-store.astra";

describe("mapAstraDoc page", () => {
  it("omits the page key when the document has no page", () => {
    const chunk = mapAstraDoc({ content: "正文", $similarity: 0.5 });
    expect(chunk.text).toBe("正文");
    expect(chunk).not.toHaveProperty("page");
  });

  it("keeps page when it is the number 3", () => {
    expect(mapAstraDoc({ content: "正文", $similarity: 0.5, page: 3 }).page).toBe(3);
  });

  it("maps tags into keywords (prefer tags over legacy keywords)", () => {
    expect(
      mapAstraDoc({ content: "正文", $similarity: 0.5, tags: ["a"], keywords: ["legacy"] })
        .keywords,
    ).toEqual(["a"]);
  });

  it("falls back to legacy keywords when tags absent", () => {
    expect(mapAstraDoc({ content: "正文", $similarity: 0.5, keywords: ["k"] }).keywords).toEqual([
      "k",
    ]);
  });
});
