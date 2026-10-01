import { describe, expect, it } from "vitest";

import { guestRetrievalDocumentIds } from "./guest-retrieval-ids";

describe("guestRetrievalDocumentIds", () => {
  it("returns undefined for seed corpus (no ACL filter)", () => {
    expect(
      guestRetrievalDocumentIds({
        corpus: "seed",
        allowedDocumentIds: [],
      }),
    ).toBeUndefined();
  });

  it("returns undefined for authenticated user on seed corpus", () => {
    expect(
      guestRetrievalDocumentIds({
        corpus: "seed",
        allowedDocumentIds: ["user-doc-1"],
      }),
    ).toBeUndefined();
  });

  it("returns empty array for empty allowlist on user corpus", () => {
    expect(
      guestRetrievalDocumentIds({
        corpus: "user",
        allowedDocumentIds: [],
      }),
    ).toEqual([]);
  });

  it("passes through allowlist on user corpus", () => {
    expect(
      guestRetrievalDocumentIds({
        corpus: "user",
        allowedDocumentIds: ["a", "b"],
      }),
    ).toEqual(["a", "b"]);
  });
});
