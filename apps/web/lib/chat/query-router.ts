/**
 * 查询路由：决定「直接回答」还是「检索知识库」。
 *
 * ENABLE_INTENT_ROUTER=true（默认）：shared resolveIntentPlan + mapIntentPlanToChatRoute（D-01/D-16）
 * ENABLE_INTENT_ROUTER=false：legacy 三层决策（D-10 rollback）
 */

import { generateRagHelperText } from "@personal-gpt/shared/ai/rag-helper";
import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import type { Corpus } from "@personal-gpt/shared";
import { getNeo4jDriverFromEnv } from "@personal-gpt/shared";
import {
  mapIntentPlanToChatRoute,
  readIntentRouterConfig,
  resolveIntentPlan,
  type PrimaryIntent,
} from "@personal-gpt/shared/routing";
import { z } from "zod";

import {
  probeKbRelevance,
  precheckSuggestsDirect,
  precheckSuggestsRetrieve,
} from "./embedding-precheck";
import { isEmptyQuery, isGreetingOnly, isPureMathExpression } from "./query-intent";
import { ENABLE_EMBEDDING_ROUTE_PRECHECK, ENABLE_LLM_QUERY_ROUTER } from "./rag-options";

export type QueryRoute = "direct" | "retrieve";

export interface QueryRouteDecision {
  route: QueryRoute;
  reason: string;
  fastPath?: boolean;
  precheckSimilarity?: number;
  needsGraphContext?: boolean;
  graphContextType?: "graph_relation";
  intentPrimary?: PrimaryIntent;
}

export interface DecideQueryRouteOptions {
  workspaceId?: string;
  requestId?: string;
  corpus?: Corpus;
}

const RouteSchema = z.object({
  route: z.enum(["direct", "retrieve"]),
  reason: z.string(),
});

let neo4jOkCache: boolean | null = null;
let neo4jOkCachedAt = 0;
let neo4jProbeInFlight: Promise<boolean> | null = null;
const NEO4J_PROBE_TTL_MS = 30_000;
const NEO4J_PROBE_TIMEOUT_MS = 2_000;

async function probeNeo4jOnce(): Promise<boolean> {
  try {
    const driver = getNeo4jDriverFromEnv();
    if (!driver) return false;
    await Promise.race([
      driver.verifyConnectivity(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("neo4j_probe_timeout")), NEO4J_PROBE_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Cached Neo4j probe — fail-open degrade per D-10; TTL re-probe (WR-05) */
async function probeNeo4jAvailable(): Promise<boolean> {
  if (neo4jOkCache !== null && Date.now() - neo4jOkCachedAt < NEO4J_PROBE_TTL_MS) {
    return neo4jOkCache;
  }
  if (!neo4jProbeInFlight) {
    neo4jProbeInFlight = probeNeo4jOnce()
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

function tryIntentFastPath(query: string): QueryRouteDecision | null {
  if (isEmptyQuery(query)) {
    return { route: "direct", reason: "empty_query", fastPath: true };
  }

  if (isPureMathExpression(query)) {
    return { route: "direct", reason: "pure_math", fastPath: true };
  }

  if (isGreetingOnly(query)) {
    return { route: "direct", reason: "greeting_only", fastPath: true };
  }

  return null;
}

function routeQueryHeuristic(): QueryRouteDecision {
  return { route: "retrieve", reason: "heuristic_default_retrieve_safe" };
}

const ROUTER_SYSTEM = `你是企业知识库问答路由器。判断用户问题是否需要检索「私有知识库」（用户上传文档、企业内部资料）。

输出严格 JSON，不要 markdown：{"route":"direct"|"retrieve","reason":"一句话中文"}

retrieve（需要检索）：
- 询问用户上传文档、内部资料、知识库中的具体内容或细节
- 需要引用私有/内部资料才能准确回答

direct（直接回答，不检索）：
- 通用知识、公开信息（公司评价、技术概念、历史常识、翻译、写作等）
- 闲聊、寒暄、纯算式
- 无需查阅私有文档即可回答的问题`;

async function routeWithLlm(query: string): Promise<QueryRouteDecision> {
  const raw = await generateRagHelperText(ROUTER_SYSTEM, query, 0);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return routeQueryHeuristic();
  }

  try {
    const parsed = RouteSchema.parse(JSON.parse(jsonMatch[0]));
    return { route: parsed.route, reason: `llm:${parsed.reason}` };
  } catch {
    return routeQueryHeuristic();
  }
}

type EmbeddingPrecheckOutcome =
  { kind: "decided"; decision: QueryRouteDecision } | { kind: "skip" };

async function routeWithEmbeddingPrecheck(
  query: string,
  options: DecideQueryRouteOptions,
): Promise<EmbeddingPrecheckOutcome> {
  if (!ENABLE_EMBEDDING_ROUTE_PRECHECK) {
    return { kind: "skip" };
  }

  let precheck;
  try {
    precheck = await probeKbRelevance(
      query,
      options.workspaceId ?? DEFAULT_WORKSPACE_ID,
      options.requestId,
      options.corpus ?? "user",
    );
  } catch {
    return { kind: "skip" };
  }

  if (!precheck.probed) {
    return { kind: "skip" };
  }

  const similarityMeta = { precheckSimilarity: precheck.topSimilarity };

  if (precheckSuggestsRetrieve(precheck)) {
    return {
      kind: "decided",
      decision: {
        route: "retrieve",
        reason: `embedding_precheck:high_sim:${precheck.topSimilarity.toFixed(3)}`,
        fastPath: true,
        ...similarityMeta,
      },
    };
  }

  if (precheckSuggestsDirect(precheck)) {
    return {
      kind: "decided",
      decision: {
        route: "direct",
        reason: `embedding_precheck:low_sim:${precheck.topSimilarity.toFixed(3)}`,
        fastPath: true,
        ...similarityMeta,
      },
    };
  }

  return {
    kind: "decided",
    decision: {
      route: "retrieve",
      reason: `embedding_precheck:gray_retrieve:${precheck.topSimilarity.toFixed(3)}`,
      fastPath: true,
      ...similarityMeta,
    },
  };
}

async function decideQueryRouteLegacy(
  query: string,
  options: DecideQueryRouteOptions,
): Promise<QueryRouteDecision> {
  const intentFast = tryIntentFastPath(query);
  if (intentFast) {
    return intentFast;
  }

  const precheckOutcome = await routeWithEmbeddingPrecheck(query, options);
  if (precheckOutcome.kind === "decided") {
    return precheckOutcome.decision;
  }

  if (ENABLE_LLM_QUERY_ROUTER) {
    try {
      return await routeWithLlm(query);
    } catch {
      return routeQueryHeuristic();
    }
  }

  return routeQueryHeuristic();
}

async function decideWithSharedRouter(
  query: string,
  options: DecideQueryRouteOptions,
): Promise<QueryRouteDecision> {
  const neo4jOk = await probeNeo4jAvailable();
  const { plan, precheckSimilarity } = await resolveIntentPlan(query, {
    probeKb: async (q) =>
      probeKbRelevance(
        q,
        options.workspaceId ?? DEFAULT_WORKSPACE_ID,
        options.requestId,
        options.corpus ?? "user",
      ),
    neo4jAvailable: () => neo4jOk,
  });

  const mapped = mapIntentPlanToChatRoute(plan);

  return {
    route: mapped.route,
    reason: mapped.reason,
    fastPath: true,
    precheckSimilarity,
    needsGraphContext: mapped.needsGraphContext,
    graphContextType: mapped.graphContextType,
    intentPrimary: plan.primary,
  };
}

/**
 * 决定当前 query 应走「直接回答」还是「向量检索」。
 */
export async function decideQueryRoute(
  query: string,
  options: DecideQueryRouteOptions = {},
): Promise<QueryRouteDecision> {
  const config = readIntentRouterConfig();
  if (!config.enableIntentRouter) {
    return decideQueryRouteLegacy(query, options);
  }
  return decideWithSharedRouter(query, options);
}

/** @deprecated 请用 decideQueryRoute；仅供同步单测/回归里寒暄短路 */
export function shouldUseVectorSearch(query: string): boolean {
  const intentFast = tryIntentFastPath(query);
  if (intentFast) {
    return intentFast.route === "retrieve";
  }
  return false;
}
