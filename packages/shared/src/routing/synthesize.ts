import { readIntentRouterConfig } from "./config";
import { l1SuggestsGeneral, l1SuggestsKbDoc } from "./l1-signals";
import type {
  IntentPlan,
  L0Hit,
  PrimaryIntent,
  RetrievalChannel,
  SpecialistName,
  SynthesizeInput,
} from "./types";

function channelsFor(primary: PrimaryIntent): RetrievalChannel {
  switch (primary) {
    case "chitchat":
    case "general":
      return "none";
    case "kb_doc":
      return "kb";
    case "graph_relation":
      return "graph";
    case "kb_graph_hybrid":
      return "kb+graph";
    case "web_research":
      return "web";
    case "analytics":
    case "report":
      return "none";
    case "multi_step":
      return "kb";
    default:
      return "none";
  }
}

function retrieverToolsFor(primary: PrimaryIntent, graphSignal: boolean): string[] {
  switch (primary) {
    case "graph_relation":
      return ["graph_search"];
    case "kb_doc":
      return ["kb_search"];
    case "kb_graph_hybrid":
      return ["kb_search", "graph_search"];
    case "multi_step":
      return graphSignal ? ["kb_search", "graph_search"] : ["kb_search"];
    default:
      return [];
  }
}

function buildFallbackChain(
  primary: PrimaryIntent,
  graphSignal: boolean,
  neo4jOk: boolean,
  l0?: L0Hit | null,
  enableKbGraphFallback = true,
): string[] {
  if (!neo4jOk) return primary === "graph_relation" ? ["kb_search"] : [];

  if (primary === "graph_relation") return ["kb_search"];

  if (primary === "kb_doc" || primary === "kb_graph_hybrid") {
    if (!enableKbGraphFallback) return [];
    const hasGraphHint =
      graphSignal ||
      l0?.graphSignal === true ||
      l0?.primary === "graph_relation" ||
      primary === "kb_graph_hybrid";
    if (hasGraphHint) return ["graph_search"];
  }

  return [];
}

function finalizeFromL0(hit: L0Hit, neo4jOk: boolean, enableKbGraphFallback = true): IntentPlan {
  if (!neo4jOk && hit.primary === "graph_relation") {
    return {
      primary: "kb_doc",
      channels: "kb",
      specialists: ["retriever"],
      retrieverTools: ["kb_search"],
      fallbackChain: [],
      reason: `${hit.reason};neo4j_unavailable`,
      confidence: 0.85,
      graphSignal: hit.graphSignal,
    };
  }

  return {
    primary: hit.primary,
    channels: hit.channels ?? channelsFor(hit.primary),
    specialists: [...hit.specialists],
    retrieverTools: [...hit.retrieverTools],
    fallbackChain: buildFallbackChain(
      hit.primary,
      hit.graphSignal ?? false,
      neo4jOk,
      hit,
      enableKbGraphFallback,
    ),
    reason: hit.reason,
    confidence: 0.95,
    graphSignal: hit.graphSignal,
  };
}

function pickPrimary(input: SynthesizeInput): PrimaryIntent {
  if (input.l2Hint?.primary) return input.l2Hint.primary;

  if (input.l0?.terminal) return input.l0.primary;

  const l1 = input.l1;
  if (l1?.graphSignal && l1SuggestsKbDoc(l1)) return "kb_graph_hybrid";
  if (l1?.graphSignal) return "graph_relation";
  if (l1 && l1SuggestsKbDoc(l1)) return "kb_doc";
  if (l1 && l1SuggestsGeneral(l1)) return "general";

  return "general";
}

function specialistsFor(input: SynthesizeInput, primary: PrimaryIntent): SpecialistName[] {
  if (input.l0?.specialists?.length) return [...input.l0.specialists];
  if (primary === "kb_doc" || primary === "graph_relation" || primary === "kb_graph_hybrid") {
    return ["retriever"];
  }
  return [];
}

function isAmbiguous(input: SynthesizeInput, primary: PrimaryIntent): boolean {
  if (input.l2Hint?.ambiguous === true) return true;
  if (primary !== "general") return false;
  const l1 = input.l1;
  if (!l1?.kb?.probed) return true;
  return Boolean(l1.kbGray);
}

function looksLikeKbContentQuery(query: string): boolean {
  const q = query.trim();
  return /知识库|企业.?库|内部.?文档|我上传|文档里|资料里|有哪些内容|什么内容|包含哪些|整理给我|整理成/i.test(
    q,
  );
}

function buildPlanReason(input: SynthesizeInput, primary: PrimaryIntent): string {
  if (input.l2Hint?.primary === primary && input.l2Hint.reason) {
    return input.l2Hint.reason;
  }
  return input.l0?.reason ?? input.l1?.reason ?? input.l2Hint?.reason ?? "l3:default";
}

export function synthesizeIntentPlan(input: SynthesizeInput): IntentPlan {
  const neo4jOk = input.neo4jOk !== false;
  const cfg = input.config ?? readIntentRouterConfig();
  const enableKbGraphFallback = cfg.enableKbGraphFallback;

  if (input.l0?.terminal) {
    return finalizeFromL0(input.l0, neo4jOk, enableKbGraphFallback);
  }

  const graphSignal = Boolean(
    input.l0?.graphSignal || input.l1?.graphSignal || input.l2Hint?.graphSignal,
  );
  const primary = pickPrimary(input);
  const specialists = specialistsFor(input, primary);
  const retrieverTools =
    input.l0?.retrieverTools?.length && primary === input.l0.primary
      ? [...input.l0.retrieverTools]
      : retrieverToolsFor(primary, graphSignal);

  const plan: IntentPlan = {
    primary,
    channels: channelsFor(primary),
    specialists,
    retrieverTools,
    fallbackChain: buildFallbackChain(
      primary,
      graphSignal,
      neo4jOk,
      input.l0,
      enableKbGraphFallback,
    ),
    reason: buildPlanReason(input, primary),
    confidence: input.l2Hint?.confidence ?? (input.l0 ? 0.95 : input.l1?.kbHigh ? 0.85 : 0.65),
    graphSignal: graphSignal || undefined,
  };

  if (isAmbiguous(input, primary)) {
    plan.ambiguous = true;
    if (primary === "general" && input.l1?.kbGray) {
      plan.primary = "kb_doc";
      plan.channels = "kb";
      plan.specialists = ["retriever"];
      plan.retrieverTools = ["kb_search"];
      plan.fallbackChain = buildFallbackChain(
        "kb_doc",
        graphSignal,
        neo4jOk,
        input.l0,
        enableKbGraphFallback,
      );
      plan.reason = `${input.l1?.reason ?? "l3:gray"};retrieve_safe`;
      plan.ambiguous = false;
    }
  }

  void cfg.enableL2IntentClassifier;

  if (
    plan.primary === "general" &&
    !graphSignal &&
    plan.specialists.length === 0 &&
    looksLikeKbContentQuery(input.query)
  ) {
    plan.primary = "kb_doc";
    plan.channels = "kb";
    plan.specialists = ["retriever"];
    plan.retrieverTools = ["kb_search"];
    plan.fallbackChain = buildFallbackChain(
      "kb_doc",
      graphSignal,
      neo4jOk,
      input.l0,
      enableKbGraphFallback,
    );
    plan.reason = `${plan.reason};l3:content_query_kb`;
    plan.ambiguous = false;
  }

  return plan;
}
