import { describe, expect, it } from "vitest";

import {
  purgeGraphThenCatalog,
  shouldCleanupVectorsAfterFailure,
  shouldFailJobOnGraphExtractError,
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

describe("shouldFailJobOnGraphExtractError", () => {
  it("fails job when reindex purged graph then extract errors", () => {
    expect(
      shouldFailJobOnGraphExtractError({
        preserveExistingVectors: true,
        graphWasPurged: true,
      }),
    ).toBe(true);
  });

  it("fails job when Neo4j purged but catalog delete is what threw", () => {
    // Processor sets graphWasPurged immediately after deleteGraph succeeds.
    expect(
      shouldFailJobOnGraphExtractError({
        preserveExistingVectors: true,
        graphWasPurged: true,
      }),
    ).toBe(true);
  });

  it("does not fail job on first-time ingest graph skip", () => {
    expect(
      shouldFailJobOnGraphExtractError({
        preserveExistingVectors: false,
        graphWasPurged: false,
      }),
    ).toBe(false);
  });
});

describe("purgeGraphThenCatalog", () => {
  it("marks graph deleted before catalog failure", async () => {
    const order: string[] = [];
    await expect(
      purgeGraphThenCatalog({
        deleteGraph: async () => {
          order.push("graph");
        },
        onGraphDeleted: () => {
          order.push("flag");
        },
        deleteCatalog: async () => {
          order.push("catalog");
          throw new Error("catalog boom");
        },
      }),
    ).rejects.toThrow(/catalog boom/);
    expect(order).toEqual(["graph", "flag", "catalog"]);
  });
});
