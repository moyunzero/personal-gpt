/**
 * 从 graph_search 工具原文生成面向用户的 Markdown（LLM 漏答时兜底）。
 */

const REL_LABEL_ZH: Record<string, string> = {
  CONTAINS: "包含",
  USES: "采用",
  BELONGS_TO: "属于",
  SUITABLE_FOR: "适合",
};

type ParsedNode = { id: string; label: string; name: string };
type ParsedRel = { fromId: string; type: string; toId: string };

function parseGraphToolNodes(graphOut: string): ParsedNode[] {
  const nodes: ParsedNode[] = [];
  for (const m of graphOut.matchAll(
    /-\s*id=([^\s]+)\s+labels=([^\s]+(?:\|[^\s]+)*)\s+name=([^\n]+)/g,
  )) {
    nodes.push({
      id: m[1]!.trim(),
      label: m[2]!.split("|")[0] ?? "Node",
      name: m[3]!.trim(),
    });
  }
  return nodes;
}

function parseGraphToolRelationships(graphOut: string): ParsedRel[] {
  const rels: ParsedRel[] = [];
  for (const m of graphOut.matchAll(/-\s*(\S+)\s*-\[([^\]]+)\]->\s*(\S+)/g)) {
    const fromId = m[1]!;
    const toId = m[3]!;
    if (!/^[a-z]+:[\w-]+$/i.test(fromId) || !/^[a-z]+:[\w-]+$/i.test(toId)) continue;
    rels.push({ fromId, type: m[2]!, toId });
  }
  return rels;
}

function relLabelZh(type: string): string {
  return REL_LABEL_ZH[type.toUpperCase()] ?? type;
}

function buildGraphSummary(nodes: ParsedNode[], rels: ParsedRel[]): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const contains = rels.find((r) => r.type.toUpperCase() === "CONTAINS");
  const uses = rels.find((r) => r.type.toUpperCase() === "USES");
  if (contains && uses) {
    const product = byId.get(contains.fromId);
    const ingredient = byId.get(contains.toId);
    const method = byId.get(uses.toId);
    if (product && ingredient && method && uses.fromId === contains.toId) {
      return `**${product.name}**包含**${ingredient.name}**，${ingredient.name}采用**${method.name}**工艺。`;
    }
  }
  const parts = rels.map((r) => {
    const from = byId.get(r.fromId)?.name ?? r.fromId;
    const to = byId.get(r.toId)?.name ?? r.toId;
    return `${from}${relLabelZh(r.type)}${to}`;
  });
  return parts.length ? parts.join("；") + "。" : "";
}

/** 从 graph_search 工具输出提取可读 Markdown；非 HIT 返回空串 */
export function formatGraphAnswerFromToolOutput(graphOut: string, _userText: string): string {
  if (!/GRAPH_SEARCH_STATUS:\s*HIT/i.test(graphOut)) return "";

  const nodes = parseGraphToolNodes(graphOut);
  const rels = parseGraphToolRelationships(graphOut);

  if (nodes.length === 0) {
    const pathBlock = graphOut.match(/\[path \d+\][\s\S]*?(?=\n\[path \d+\]|\n*$)/i)?.[0];
    const pathLine =
      pathBlock?.match(/nodes:\s*([^\n]+)/i)?.[1] ??
      graphOut.match(/\[path \d+\]\s*nodes:\s*([^\n]+)/i)?.[1];
    if (!pathLine?.trim()) return "";
    return ["根据企业内部知识图谱，找到以下关联路径：", "", pathLine.trim()].join("\n");
  }

  const idToName = new Map(nodes.map((n) => [n.id, n.name]));
  const summary = buildGraphSummary(nodes, rels);

  const lines = ["根据企业内部知识图谱：", ""];
  if (summary) lines.push(summary, "");

  lines.push("**涉及实体：**");
  for (const n of nodes) {
    lines.push(`- ${n.name}（${n.label}）`);
  }

  if (rels.length > 0) {
    lines.push("", "**关系：**");
    for (const r of rels) {
      const from = idToName.get(r.fromId) ?? r.fromId;
      const to = idToName.get(r.toId) ?? r.toId;
      lines.push(`- ${from} → ${relLabelZh(r.type)} → ${to}`);
    }
  }

  return lines.join("\n");
}
