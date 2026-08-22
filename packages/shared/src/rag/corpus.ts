/**
 * Corpus routing (D-24/D-25): user vs seed → Astra collection + ES index.
 * Default caller path uses "user" (D-27 enforced at hybridSearch).
 */

export type Corpus = "user" | "seed";

export interface CorpusTargets {
  astraCollection: string;
  esIndex: string;
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback?.trim();
  if (!value) {
    throw new Error(`[corpus] missing env ${name}`);
  }
  return value;
}

/** Map corpus → physical Astra collection + ES index names. */
export function resolveCorpusTargets(corpus: Corpus): CorpusTargets {
  const legacyCollection = process.env.ASTRA_DB_COLLECTION?.trim();

  if (corpus === "seed") {
    return {
      astraCollection: requireEnv(
        "ASTRA_DB_COLLECTION_SEED",
        legacyCollection ? `${legacyCollection}_seed` : "kb_seed",
      ),
      esIndex: requireEnv("ES_INDEX_SEED", "kb_seed"),
    };
  }

  return {
    astraCollection: requireEnv("ASTRA_DB_COLLECTION_USER", legacyCollection ?? "kb_user"),
    esIndex: requireEnv("ES_INDEX_USER", "kb_user"),
  };
}
