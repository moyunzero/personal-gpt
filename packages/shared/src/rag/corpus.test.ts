import { afterEach, describe, expect, it } from "vitest";

import { resolveCorpusTargets } from "./corpus";

describe("resolveCorpusTargets seed fallback", () => {
  const saved = {
    legacy: process.env.ASTRA_DB_COLLECTION,
    seed: process.env.ASTRA_DB_COLLECTION_SEED,
    user: process.env.ASTRA_DB_COLLECTION_USER,
  };

  afterEach(() => {
    if (saved.legacy === undefined) delete process.env.ASTRA_DB_COLLECTION;
    else process.env.ASTRA_DB_COLLECTION = saved.legacy;
    if (saved.seed === undefined) delete process.env.ASTRA_DB_COLLECTION_SEED;
    else process.env.ASTRA_DB_COLLECTION_SEED = saved.seed;
    if (saved.user === undefined) delete process.env.ASTRA_DB_COLLECTION_USER;
    else process.env.ASTRA_DB_COLLECTION_USER = saved.user;
  });

  it("uses legacy ASTRA_DB_COLLECTION directly for seed when SEED unset", () => {
    process.env.ASTRA_DB_COLLECTION = "db_emotion";
    delete process.env.ASTRA_DB_COLLECTION_SEED;

    expect(resolveCorpusTargets("seed").astraCollection).toBe("db_emotion");
  });

  it("falls back to kb_seed when neither legacy nor SEED is set", () => {
    delete process.env.ASTRA_DB_COLLECTION;
    delete process.env.ASTRA_DB_COLLECTION_SEED;

    expect(resolveCorpusTargets("seed").astraCollection).toBe("kb_seed");
  });

  it("user corpus falls back to legacy ASTRA_DB_COLLECTION when USER unset", () => {
    process.env.ASTRA_DB_COLLECTION = "db_emotion";
    delete process.env.ASTRA_DB_COLLECTION_USER;

    expect(resolveCorpusTargets("user").astraCollection).toBe("db_emotion");
  });

  it("user corpus uses kb_user default when legacy and USER unset", () => {
    delete process.env.ASTRA_DB_COLLECTION;
    delete process.env.ASTRA_DB_COLLECTION_USER;

    expect(resolveCorpusTargets("user").astraCollection).toBe("kb_user");
  });
});
