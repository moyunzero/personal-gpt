/**
 * 查询路由：决定「直接回答」还是「检索知识库」。
 *
 * 三层决策：
 *   1. 意图快路径（寒暄、算式）— query-intent 词表
 *   2. embedding Top-1 预检 — 高相似 retrieve / 低相似 direct / 灰色地带 retrieve（宁可多检）
 *   3. LLM 路由器 — 仅预检不可用时（关闭预检或 embedding 失败）
 */

import { generateRagHelperText } from "@personal-gpt/shared/ai/rag-helper";
import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
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
}

export interface DecideQueryRouteOptions {
  workspaceId?: string;
  requestId?: string;
}

const RouteSchema = z.object({
  route: z.enum(["direct", "retrieve"]),
  reason: z.string(),
});

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
  return { route: "direct", reason: "heuristic_default_direct" };
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

  const precheck = await probeKbRelevance(
    query,
    options.workspaceId ?? DEFAULT_WORKSPACE_ID,
    options.requestId,
  );

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

  // 灰色地带 [directBelow, retrieveAt)：宁可多检，不调用 LLM
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

/**
 * 决定当前 query 应走「直接回答」还是「向量检索」。
 */
export async function decideQueryRoute(
  query: string,
  options: DecideQueryRouteOptions = {},
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

/** @deprecated 请用 decideQueryRoute；仅供同步单测/回归里寒暄短路 */
export function shouldUseVectorSearch(query: string): boolean {
  const intentFast = tryIntentFastPath(query);
  if (intentFast) {
    return intentFast.route === "retrieve";
  }
  return false;
}
