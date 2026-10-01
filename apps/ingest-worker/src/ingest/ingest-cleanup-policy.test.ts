import { describe, expect, it } from "vitest";

import { shouldCleanupVectorsAfterFailure } from "./ingest-cleanup-policy";

describe("shouldCleanupVectorsAfterFailure", () => {
  it("cleans up when vectors were not committed", () => {
    expect(shouldCleanupVectorsAfterFailure({ vectorsCommitted: false })).toBe(true);
  });

  it("keeps vectors when already committed (late status failure)", () => {
    expect(shouldCleanupVectorsAfterFailure({ vectorsCommitted: true })).toBe(false);
  });

  it("keeps prior vectors on reindex parse/embed failure", () => {
    expect(
      shouldCleanupVectorsAfterFailure({
        vectorsCommitted: false,
        preserveExistingVectors: true,
      }),
    ).toBe(false);
  });
});
