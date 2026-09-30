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

  it("returns empty array for authenticated user with empty allowlist (deny-all)", () => {
    expect(
      guestRetrievalDocumentIds({
        isGuest: false,
        corpus: "user",
        allowedDocumentIds: [],
      }),
    ).toEqual([]);
  });

  it("passes through allowlist for authenticated users", () => {
    expect(
      guestRetrievalDocumentIds({
        isGuest: false,
        corpus: "user",
        allowedDocumentIds: ["a", "b"],
      }),
    ).toEqual(["a", "b"]);
  });
});
