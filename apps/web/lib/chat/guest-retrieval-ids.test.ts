import { describe, expect, it } from "vitest";

import { guestRetrievalDocumentIds } from "./guest-retrieval-ids";

describe("guestRetrievalDocumentIds", () => {
  it("returns undefined for guest + seed (no ACL filter)", () => {
    expect(
      guestRetrievalDocumentIds({
        isGuest: true,
        corpus: "seed",
        allowedDocumentIds: [],
      }),
    ).toBeUndefined();
  });

  it("returns undefined for authenticated user on seed corpus", () => {
    expect(
      guestRetrievalDocumentIds({
        isGuest: false,
        corpus: "seed",
        allowedDocumentIds: ["user-doc-1"],
      }),
    ).toBeUndefined();
  });

  it("returns empty array for authenticated user with empty allowlist on user corpus", () => {
    expect(
      guestRetrievalDocumentIds({
        isGuest: false,
        corpus: "user",
        allowedDocumentIds: [],
      }),
    ).toEqual([]);
  });

  it("passes through allowlist for authenticated users on user corpus", () => {
    expect(
      guestRetrievalDocumentIds({
        isGuest: false,
        corpus: "user",
        allowedDocumentIds: ["a", "b"],
      }),
    ).toEqual(["a", "b"]);
  });
});
