import { readIntentRouterConfig } from "./config";
import { collectL1Signals } from "./l1-signals";
import { matchL0Rules } from "./l0-rules";
import { classifyIntentL2, needsL2 } from "./l2-classifier";
import { synthesizeIntentPlan } from "./synthesize";
import type { IntentPlan, KbProbeResult, RouterLayer } from "./types";

export interface ResolveIntentPlanDeps {
  probeKb?: (query: string) => Promise<KbProbeResult>;
  classifyL2?: (query: string) => Promise<Partial<IntentPlan> | null>;
  neo4jAvailable?: () => boolean;
}

export interface ResolveIntentPlanResult {
  plan: IntentPlan;
  layers: RouterLayer[];
}

/** D-03: L0 → optional L1 (skip when l0.terminal) → optional L2 → L3 synthesize */
export async function resolveIntentPlan(
  query: string,
  deps: ResolveIntentPlanDeps = {},
): Promise<ResolveIntentPlanResult> {
  const config = readIntentRouterConfig();
  const layers: RouterLayer[] = [];
  const neo4jOk = deps.neo4jAvailable?.() ?? true;

  const l0 = matchL0Rules(query);
  if (l0) layers.push("L0");

  let l1;
  if (!l0?.terminal) {
    l1 = await collectL1Signals(query, {
      probeKb: deps.probeKb,
      routeRetrieveSimilarity: config.routeRetrieveSimilarity,
      routeDirectSimilarity: config.routeDirectSimilarity,
    });
    layers.push("L1");
  }

  let l2Hint: Partial<IntentPlan> | null | undefined;
  if (
    config.enableL2IntentClassifier &&
    needsL2(l0, l1) &&
    deps.classifyL2
  ) {
    l2Hint = await deps.classifyL2(query);
    if (l2Hint) layers.push("L2");
  } else if (config.enableL2IntentClassifier && needsL2(l0, l1)) {
    l2Hint = await classifyIntentL2(query);
    if (l2Hint) layers.push("L2");
  }

  const plan = synthesizeIntentPlan({
    query,
    l0,
    l1,
    l2Hint,
    neo4jOk,
    config,
  });

  return { plan, layers };
}
