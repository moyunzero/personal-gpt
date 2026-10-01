import { describe, expect, it } from "vitest";

import {
  shouldCleanupVectorsAfterFailure,
  shouldPurgeGraphBeforeReextract,
} from "./ingest-cleanup-policy";

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

describe("shouldPurgeGraphBeforeReextract", () => {
  it("purges prior graph on reindex before re-extract", () => {
    expect(shouldPurgeGraphBeforeReextract({ preserveExistingVectors: true })).toBe(true);
  });

  it("skips purge on first-time ingest", () => {
    expect(shouldPurgeGraphBeforeReextract({ preserveExistingVectors: false })).toBe(false);
    expect(shouldPurgeGraphBeforeReextract({})).toBe(false);
  });
});
