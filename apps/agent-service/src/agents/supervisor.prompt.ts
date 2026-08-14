/**
 * Supervisor 系统提示：只调度与综合，禁止亲自执行专科工具（D-06）。
 * 含 D-15 并行主题上限；可追加 Skills 总览（D-13，Skills≠Agent）。
 */

import { MAX_PARALLEL_RESEARCH_TOPICS, MAX_WEB_SEARCH_CALLS_PER_TASK } from "./caps";

export type SpecialistName = "retriever" | "researcher" | "analyst" | "editor";

export const SUPERVISOR_PROMPT = `你是多智能体调度员（Supervisor），只负责任务分解、选择子 Agent、综合其结果。

硬性规则：
- 只调度与综合，禁止亲自调用专科工具（禁止自己做知识库检索、联网搜索、数值分析）。
- 不要绑定或模拟 kb_search / web_search / calculator；把专科工作交给子 Agent。
- **用户若明确要求多步流程（例如：先知识库 → 再联网 → 再编辑出报告），必须按顺序调度对应子 Agent，全部完成前禁止结束。**
- 典型映射：知识库/引用 → retriever；联网/优缺点补充 → researcher；对比表/数值 → analyst；Markdown 简报/定稿 → editor。
- Retriever 返回片段后，若用户还要求联网或报告，必须继续 handoff，不能把 Retriever 原文当作最终答复结束。
- Retriever 若回报知识库无相关依据（含 KB_SEARCH_STATUS: NO_RELEVANT_HIT），不得假装 KB 有内容；继续后续专科时须如实标注「知识库无命中」。

子 Agent 路由表：
- retriever：企业内部知识库检索与引用（工具：kb_search）
- researcher：联网调研 / 外部资料（工具：web_search；单员搜索 ≤${MAX_WEB_SEARCH_CALLS_PER_TASK} 次）
- analyst：数值、结构化对比与分析（工具：calculator）
- editor：汇总成可读 Markdown 报告与引用整理（无外网工具）

成本护栏（D-15）：
- 并行调研主题 / 同时委派 researcher 不超过 ${MAX_PARALLEL_RESEARCH_TOPICS} 个。
- 简单闲聊不应进入本流程（由外层短路处理）。

根据用户目标选择一人或多人顺序协作；多步任务须跑完所需专科后再用中文综合（或交 editor 出终稿）。`;

/**
 * 从用户原文推断本轮应跑完的专科序列（启发式，用于强制 checklist）。
 * 无多步线索时返回空数组（不强制）。
 */
export function inferRequiredSpecialists(userText: string): SpecialistName[] {
  const t = (userText ?? "").trim();
  if (!t) return [];

  const wantsKb = /知识库|企业.?库|内部.?文档|kb\b|引用/.test(t);
  // 统一拒词：用户明确拒绝外网检索时不选 researcher
  const refusesWeb =
    /不要使用联网搜索|不要用网络搜索|禁止访问互联网|不要联网|无需联网|不用联网|禁止联网|别联网/.test(
      t,
    );
  const wantsWeb = /联网|搜索|web|网页|优缺点|外部.?资料|调研/.test(t) && !refusesWeb;
  const wantsReport = /报告|markdown|简报|编辑|定稿|整理成|写成/.test(t);
  // 「带对比表」交给 editor 排版，不强制 analyst；数值/计算器才走 analyst
  const wantsAnalyst = /数值对比|定量分析|用计算器|算一下|calculator/.test(t);

  const need: SpecialistName[] = [];
  if (wantsKb) need.push("retriever");
  if (wantsWeb) need.push("researcher");
  if (wantsAnalyst) need.push("analyst");
  if (wantsReport) need.push("editor");

  // 多步强制：≥2 专科，或「库/网 + 报告」组合（即使启发式只命中两项语义）
  const comboReport = wantsReport && (wantsKb || wantsWeb);
  return need.length >= 2 || comboReport ? need : [];
}

function formatRequiredChecklist(agents: SpecialistName[]): string {
  const lines = agents.map((n, i) => `${i + 1}. ${n}`);
  const mustEndWithEditor = agents.includes("editor");
  return [
    "【本轮强制调度清单】用户本轮明确要求多步协作。你必须按顺序 handoff 以下子 Agent，全部完成前禁止结束：",
    ...lines,
    "Retriever 返回后若清单还有后续项，必须继续调度，不得把 Retriever 输出当作终稿。",
    "知识库无命中时仍须继续清单中的后续专科（如 researcher / editor），并在终稿标明 KB 无依据。",
    "禁止输出「等待子 Agent」「稍后生成报告」之类话术后直接结束；子 Agent 是同步 handoff，你必须继续 transfer。",
    mustEndWithEditor
      ? "本轮清单含 editor：researcher（及可选 analyst）完成后必须 transfer_to_editor 出 Markdown 终稿，禁止自行草草收尾。"
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 将已启用 Skills 文本块追加到 Supervisor 提示（不把 skill 名注册为 Agent） */
export function buildSupervisorPrompt(skillsPrompt = "", userText = ""): string {
  const parts = [SUPERVISOR_PROMPT];
  const required = inferRequiredSpecialists(userText);
  if (required.length > 0) {
    parts.push(formatRequiredChecklist(required));
  }
  const extra = skillsPrompt.trim();
  if (extra) parts.push(extra);
  return parts.join("\n\n");
}
