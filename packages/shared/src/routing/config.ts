function readFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

export interface IntentRouterConfig {
  /** D-10: master switch — default on */
  enableIntentRouter: boolean;
  /** D-10: KB miss → graph fallback — default on */
  enableKbGraphFallback: boolean;
  /** D-14: L2 JSON classifier — default OFF; requires ENABLE_L2_INTENT_CLASSIFIER=true */
  enableL2IntentClassifier: boolean;
  /** L1 high-sim threshold (raw Top-1 cosine) */
  routeRetrieveSimilarity: number;
  /** L1 low-sim threshold (raw Top-1 cosine) */
  routeDirectSimilarity: number;
}

/** D-10 + D-14 — L2 default false, NOT synced to ENABLE_LLM_QUERY_ROUTER */
export function readIntentRouterConfig(): IntentRouterConfig {
  return {
    enableIntentRouter: process.env.ENABLE_INTENT_ROUTER !== "false",
    enableKbGraphFallback: process.env.ENABLE_KB_GRAPH_FALLBACK !== "false",
    enableL2IntentClassifier: process.env.ENABLE_L2_INTENT_CLASSIFIER === "true",
    routeRetrieveSimilarity: readFloatEnv("ROUTE_RETRIEVE_SIMILARITY", 0.68),
    routeDirectSimilarity: readFloatEnv("ROUTE_DIRECT_SIMILARITY", 0.42),
  };
}
