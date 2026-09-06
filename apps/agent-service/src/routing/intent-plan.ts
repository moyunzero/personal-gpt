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
let neo4jOkCachedAt = 0;
let neo4jProbeInFlight: Promise<boolean> | null = null;
const NEO4J_PROBE_TTL_MS = 30_000;
const NEO4J_PROBE_TIMEOUT_MS = 2_000;

async function probeNeo4jConnectivity(): Promise<boolean> {
  try {
    const driver = getNeo4jDriverFromEnv();
    await Promise.race([
      driver.verifyConnectivity(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("neo4j_probe_timeout")),
          NEO4J_PROBE_TIMEOUT_MS,
        );
        timer.unref?.();
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Cached Neo4j probe — fail-open degrade per D-10; TTL re-probe (WR-05) */
export async function probeNeo4jAvailable(): Promise<boolean> {
  if (neo4jOkCache !== null && Date.now() - neo4jOkCachedAt < NEO4J_PROBE_TTL_MS) {
    return neo4jOkCache;
  }
  if (!neo4jProbeInFlight) {
    neo4jProbeInFlight = probeNeo4jConnectivity()
      .then((ok) => {
        neo4jOkCache = ok;
        neo4jOkCachedAt = Date.now();
        return ok;
      })
      .finally(() => {
        neo4jProbeInFlight = null;
      });
  }
  return neo4jProbeInFlight;
}

/** Test hook */
export function resetNeo4jAvailabilityCacheForTests(): void {
  neo4jOkCache = null;
  neo4jOkCachedAt = 0;
  neo4jProbeInFlight = null;
}

function parseKbProbeFromToolOutput(text: string | undefined): KbProbeResult {
  if (!text) return { topSimilarity: 0, probed: false };
  const simMatch = text.match(/similarity:\s*([0-9.]+)/i) ?? text.match(/最高相似度\s*([0-9.]+)/);
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
  allowedDocumentIds?: string[];
}): Promise<{ plan: IntentPlan; layers: RouterLayer[] }> {
  const config = readIntentRouterConfig();
  const neo4jOk = await probeNeo4jAvailable();
  const documentIds = input.allowedDocumentIds;

  return resolveIntentPlan(input.query, {
    probeKb: async (q: string) => {
      const out = await invokeKbSearch({
        query: extractKbSearchQuery(q),
        userText: q,
        workspaceId: input.workspaceId,
        topK: 3,
        documentIds,
      });
      return parseKbProbeFromToolOutput(out);
    },
    neo4jAvailable: () => neo4jOk,
    classifyL2: config.enableL2IntentClassifier ? classifyIntentL2 : undefined,
  });
}
