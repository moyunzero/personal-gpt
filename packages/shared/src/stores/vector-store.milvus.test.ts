import { describe, expect, it } from "vitest";

import { mapMilvusHit } from "./vector-store.milvus";

describe("mapMilvusHit", () => {
  it("maps finite page from hit.page", () => {
    expect(mapMilvusHit({ content: "x", score: 1, page: 4 }).page).toBe(4);
  });

  it("omits page when missing or non-finite", () => {
    expect(mapMilvusHit({ content: "x", score: 1 })).not.toHaveProperty("page");
    expect(mapMilvusHit({ content: "x", score: 1, page: Number.NaN })).not.toHaveProperty("page");
  });
});
