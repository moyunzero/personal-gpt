import { hasSeedGraphEntity, resolveSeedProductName } from "./graph-entities";
import type { L0Hit, SpecialistName } from "./types";

const GREETING_PHRASES = new Set([
  "你好",
  "您好",
  "嗨",
  "hi",
  "hello",
  "hey",
  "在吗",
  "在不在",
  "早上好",
  "晚上好",
  "午安",
  "拜拜",
  "再见",
  "谢谢",
  "好的",
  "ok",
  "okay",
]);

const TRAILING_PUNCTUATION = /^[\s!！?？。,，~]+|[\s!！?？。,，~]+$/g;

export function normalizeForIntent(text: string): string {
  return text.trim().replace(TRAILING_PUNCTUATION, "").toLowerCase();
}

export function isEmptyQuery(text: string): boolean {
  return !text.trim();
}

export function isPureMathExpression(text: string): boolean {
  return /^[\d\s+\-*/()=？?]+$/.test(text.trim());
}

export function isGreetingOnly(text: string): boolean {
  const core = normalizeForIntent(text);
  if (!core) return false;
  return GREETING_PHRASES.has(core);
}

/** D-06: relation lexicon — excludes standalone 「有哪些」/「包含」/「路径」 (WR-02) */
export const GRAPH_RELATION_RE = /原料|配料|工艺|用了什么|关系|关联/i;

export const KB_RE = /知识库|企业.?库|内部.?文档|kb\b|引用/i;
/** WR-B-07: exclude standalone 「搜索」 — KB listing uses KB_RE, not web research */
const WEB_RE = /联网|网络搜索|网页搜索|网页|web\b|优缺点|外部.?资料|调研/i;
export const REPORT_RE = /报告|markdown|简报|编辑|定稿|整理成|写成/i;

/** Whether query has graph-relation cues (not generic KB listing phrases alone). */
export function hasGraphRelationCue(query: string): boolean {
  return GRAPH_RELATION_RE.test(query);
}

export function matchGraphRelationL0(query: string): L0Hit | null {
  if (!hasGraphRelationCue(query)) return null;
  if (!hasSeedGraphEntity(query)) return null;
  const mixed = KB_RE.test(query) || REPORT_RE.test(query) || WEB_RE.test(query);
  return {
    primary: "graph_relation",
    channels: "graph",
    specialists: ["retriever"],
    retrieverTools: ["graph_search"],
    reason: "l0:graph_relation:seed_entity",
    terminal: !mixed,
    graphSignal: true,
  };
}

const ANALYST_RE = /数值对比|定量分析|用计算器|算一下|calculator/i;
const REFUSES_WEB_RE =
  /不要使用联网搜索|不要用网络搜索|禁止访问互联网|不要联网|无需联网|不用联网|禁止联网|别联网|不要进行网络搜索|请勿访问外网|仅使用知识库/i;
const GRAPH_KB_RE = /图谱|graph|实体|关系|节点|子图/i;

/** D-12 tie-break: retriever → researcher → analyst → editor */
const DEFAULT_ORDER: Record<SpecialistName, number> = {
  retriever: 0,
  researcher: 1,
  analyst: 2,
  editor: 3,
};

type SpecialistNeed = { name: SpecialistName; idx: number; graphOnly?: boolean };

/**
 * D-12: order specialists by first keyword appearance; tie-break DEFAULT_ORDER.
 * Graph multi-step may emit retriever-only graph_search step.
 */
export function orderSpecialistsByKeywordAppearance(query: string): SpecialistName[] {
  const t = (query ?? "").trim();
  if (!t) return [];

  const wantsKb = KB_RE.test(t);
  const refusesWeb = REFUSES_WEB_RE.test(t);
  const wantsWeb = WEB_RE.test(t) && !refusesWeb;
  const wantsReport = REPORT_RE.test(t);
  const wantsAnalyst = ANALYST_RE.test(t);
  const seedProduct = resolveSeedProductName(t);
  const wantsGraph = GRAPH_KB_RE.test(t) || (hasGraphRelationCue(t) && seedProduct !== null);

  const need: SpecialistNeed[] = [];
  if (wantsGraph) {
    need.push({
      name: "retriever",
      idx: t.search(GRAPH_KB_RE) >= 0 ? t.search(GRAPH_KB_RE) : t.search(GRAPH_RELATION_RE),
      graphOnly: true,
    });
  } else if (wantsKb) {
    need.push({ name: "retriever", idx: t.search(KB_RE) });
  }
  if (wantsWeb) need.push({ name: "researcher", idx: t.search(WEB_RE) });
  if (wantsAnalyst) need.push({ name: "analyst", idx: t.search(ANALYST_RE) });
  if (wantsReport) need.push({ name: "editor", idx: t.search(REPORT_RE) });

  const comboReport = wantsReport && (wantsKb || wantsWeb || wantsGraph);
  if (!(need.length >= 2 || comboReport)) return [];

  need.sort((a, b) => {
    if (a.idx !== b.idx) return a.idx - b.idx;
    return DEFAULT_ORDER[a.name] - DEFAULT_ORDER[b.name];
  });
  return need.map((n) => n.name);
}

export function matchMultiStepL0(query: string): L0Hit | null {
  const specialists = orderSpecialistsByKeywordAppearance(query);
  if (specialists.length < 2) return null;

  const hasGraph = hasGraphRelationCue(query) && hasSeedGraphEntity(query);
  const hasKb = KB_RE.test(query);
  const hasWeb = WEB_RE.test(query) && !REFUSES_WEB_RE.test(query);

  let retrieverTools: string[] = [];
  if (hasGraph && !hasKb) {
    retrieverTools = ["graph_search"];
  } else if (hasKb && hasGraph) {
    retrieverTools = ["kb_search", "graph_search"];
  } else if (hasKb) {
    retrieverTools = ["kb_search"];
  } else if (hasGraph) {
    retrieverTools = ["graph_search"];
  }

  return {
    primary: "multi_step",
    channels: hasWeb ? "web" : hasGraph ? "graph" : "kb",
    specialists,
    retrieverTools,
    reason: "l0:multi_step:keyword_order",
    terminal: true,
    graphSignal: hasGraph,
  };
}

function matchChitchatL0(query: string): L0Hit | null {
  if (isEmptyQuery(query)) {
    return {
      primary: "chitchat",
      channels: "none",
      specialists: [],
      retrieverTools: [],
      reason: "l0:empty_query",
      terminal: true,
    };
  }
  if (isPureMathExpression(query)) {
    return {
      primary: "general",
      channels: "none",
      specialists: [],
      retrieverTools: [],
      reason: "l0:pure_math",
      terminal: true,
    };
  }
  if (isGreetingOnly(query)) {
    return {
      primary: "chitchat",
      channels: "none",
      specialists: [],
      retrieverTools: [],
      reason: "l0:greeting",
      terminal: true,
    };
  }
  return null;
}

/** Run all L0 matchers — multi_step before graph so mixed queries win (CR-02) */
export function matchL0Rules(query: string): L0Hit | null {
  const q = query.trim();
  return matchChitchatL0(q) ?? matchMultiStepL0(q) ?? matchGraphRelationL0(q) ?? null;
}

/** Whether L0 hit used graph-only retriever tools for a step */
export function l0GraphRetrieverTools(hit: L0Hit): boolean {
  return hit.retrieverTools.length === 1 && hit.retrieverTools[0] === "graph_search";
}
