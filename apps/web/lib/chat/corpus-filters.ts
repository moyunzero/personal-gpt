/**
 * parseCorpus: request body corpus=seed|user；缺省 user（D-27/D-28, T-03-seed）。
 */
import type { Corpus } from "@personal-gpt/shared";

/**
 * @deprecated Path A/B Astra $or filter — superseded by physical corpus collections +
 * shared hybridSearch (D-24/D-29). Kept for embedding-precheck until that migrates.
 */
export const ROUTE_CORPUS_FILTER = {
  $or: [
    { documentId: { $exists: true } },
    { source: { $eq: "prompt-suggestion" } },
    { source: { $eq: "psychology-qa" } },
  ],
} as const;

/** Untrusted request field → corpus; anything other than "seed" → user. */
export function parseCorpus(raw: unknown): Corpus {
  return raw === "seed" ? "seed" : "user";
}
