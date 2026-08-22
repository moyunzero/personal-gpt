/**
 * Agent-side adapter for shared resolveIntentPlan (ROUTE-02 / D-10).
 */

import { getNeo4jDriverFromEnv } from "@personal-gpt/shared";
import {
  classifyIntentL2,
  readIntentRouterConfig,
  resolveIntentPlan,
  type IntentPlan,
  type KbProbeResult,
  type RouterLayer,
} from "@personal-gpt/shared/routing";

import { extractKbSearchQuery } from "../tools/extract-kb-query";
import { invokeKbSearch } from "../tools/kb-search.tool";

let neo4jOkCache: boolean | null = null;

/** Cached Neo4j probe — fail-open degrade per D-10 */
export async function probeNeo4jAvailable(): Promise<boolean> {
  if (neo4jOkCache !== null) return neo4jOkCache;
  try {
    const driver = getNeo4jDriverFromEnv();
    if (!driver) {
      neo4jOkCache = false;
      return false;
    }
    await driver.verifyConnectivity();
    neo4jOkCache = true;
    return true;
  } catch {
    neo4jOkCache = false;
    return false;
  }
}

/** Test hook */
export function resetNeo4jAvailabilityCacheForTests(): void {
  neo4jOkCache = null;
}

function parseKbProbeFromToolOutput(text: string | undefined): KbProbeResult {
  if (!text) return { topSimilarity: 0, probed: false };
  const simMatch =
    text.match(/similarity:\s*([0-9.]+)/i) ?? text.match(/最高相似度\s*([0-9.]+)/);
  const topSimilarity = simMatch ? Number(simMatch[1]) : 0;
  return {
    topSimilarity: Number.isFinite(topSimilarity) ? topSimilarity : 0,
    probed: /KB_SEARCH_STATUS:/i.test(text),
    title: text.match(/title:\s*(.+)/i)?.[1]?.trim(),
  };
}

export async function resolveIntentPlanForAgent(input: {
  query: string;
  workspaceId: string;
}): Promise<{ plan: IntentPlan; layers: RouterLayer[] }> {
  const config = readIntentRouterConfig();
  const neo4jOk = await probeNeo4jAvailable();

  return resolveIntentPlan(input.query, {
    probeKb: async (q: string) => {
      const out = await invokeKbSearch({
        query: extractKbSearchQuery(q),
        userText: q,
        workspaceId: input.workspaceId,
        topK: 3,
      });
      return parseKbProbeFromToolOutput(out);
    },
    neo4jAvailable: () => neo4jOk,
    classifyL2: config.enableL2IntentClassifier ? classifyIntentL2 : undefined,
  });
}
