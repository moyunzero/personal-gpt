/**
 * Retriever 子 Agent：kb_search（D-07）；可注入 kb-retrieval Skill（D-13）。
 */

import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { createAgent } from "langchain";

import { KB_CITATION_RULES, TOOL_RESULT_SAFETY } from "../prompts/fragments/kb-citation-rules";
import { graphSearchTool } from "../tools/graph-search.tool";
import { kbSearchTool } from "../tools/kb-search.tool";

export type AgentSkillOptions = {
  /** 已格式化的 Skill 文本块；追加到 systemPrompt，非 Agent 名 */
  skillPrompt?: string;
  /** D-02: hard whitelist — only bind listed tools */
  allowedTools?: string[];
};

const TOOL_BY_NAME = {
  kb_search: kbSearchTool,
  graph_search: graphSearchTool,
} as const;

export function createRetrieverAgent(model: LanguageModelLike, options: AgentSkillOptions = {}) {
  const allowed = options.allowedTools ?? ["kb_search", "graph_search"];
  if (allowed.length === 0) {
    throw new Error("createRetrieverAgent: allowedTools must not be empty (D-02)");
  }
  const tools = allowed.map((name) => {
    const tool = TOOL_BY_NAME[name as keyof typeof TOOL_BY_NAME];
    if (!tool) throw new Error(`createRetrieverAgent: unknown tool "${name}"`);
    return tool;
  });
  const allowedList = allowed.join(", ");
  const skill = options.skillPrompt?.trim() ? `\n\n${options.skillPrompt.trim()}` : "";
  const graphOnly = allowed.length === 1 && allowed[0] === "graph_search";
  const kbOnly = allowed.length === 1 && allowed[0] === "kb_search";
  const kbRules = graphOnly
    ? `- **图谱专用模式**：仅 graph_search；禁止 kb_search、禁止提及知识库未命中或 DOC-*。
- 若上下文已有【图谱预检索】且含 \`GRAPH_SEARCH_STATUS: HIT\`：
  - **禁止**再次调用 graph_search；**禁止**输出 JSON / 工具调用格式 / 代码块。
  - 直接用中文 Markdown 复述 path 中的实体名称与关系（原料、工艺等），面向用户可读。
- 若 \`GRAPH_SEARCH_STATUS: NO_PATH\`，简短说明图谱未找到相关路径，勿编造实体。`
    : kbOnly
      ? `- **知识库专用模式**：仅 kb_search；禁止 graph_search、禁止编造图谱实体或关系路径。
- **无命中硬约束**：若工具或【知识库预检索】返回含 \`KB_SEARCH_STATUS: NO_RELEVANT_HIT\`：
  - 对上游只回一句中文：「知识库未找到足够相关依据。」并另起一行保留标记 \`KB_SEARCH_STATUS: NO_RELEVANT_HIT\`（供 Editor 识别）。
  - 禁止代码块、禁止任务规划、禁止表格、禁止列举假文档 / DOC-*、禁止假装命中。
  - 不要向用户解释工具协议；终稿由 Editor 撰写。
- **有命中**：若上下文已有【知识库预检索】且为 \`KB_SEARCH_STATUS: HIT\`，直接复述其中 title / source / documentId / snippet，禁止改口称未命中；否则先调用 kb_search 再复述工具结果。
- 混库召回边界（ISSUE-001）仍存在；低相关片段已被工具过滤。`
      : `- 文档问答必须先调用 kb_search；实体关系问题调用 graph_search；禁止编造文档或图谱内容。
- **无命中硬约束**：若工具或【知识库预检索】返回含 \`KB_SEARCH_STATUS: NO_RELEVANT_HIT\`：
  - 对上游只回一句中文：「知识库未找到足够相关依据。」并另起一行保留标记 \`KB_SEARCH_STATUS: NO_RELEVANT_HIT\`（供 Editor 识别）。
  - 禁止代码块、禁止任务规划、禁止表格、禁止列举假文档 / DOC-*、禁止假装命中。
  - 不要向用户解释工具协议；终稿由 Editor 撰写。
- **有命中**：若上下文已有【知识库预检索】且为 \`KB_SEARCH_STATUS: HIT\`，直接复述其中 title / source / documentId / snippet，禁止改口称未命中；否则先调用 kb_search 再复述工具结果。
- 混库召回边界（ISSUE-001）仍存在；低相关片段已被工具过滤。`;
  const citationBlock = graphOnly ? "" : `\n${KB_CITATION_RULES}`;
  return createAgent({
    name: "retriever",
    description: graphOnly
      ? "企业知识图谱实体关系检索与复述。"
      : kbOnly
        ? "企业内部知识库检索与引用；回答需可溯源。"
        : "企业内部知识库检索与引用；回答需可溯源。",
    model,
    tools,
    systemPrompt: `你是 Retriever。职责边界：${graphOnly ? "仅处理知识图谱实体关系检索与复述。" : kbOnly ? "仅处理知识库（KB）检索与引用。" : "处理知识库（KB）检索与图谱实体关系检索。"}

规则：
${kbRules}
- ${TOOL_RESULT_SAFETY}
- 允许工具：${allowedList}（硬白名单，禁止调用列表外工具）。${citationBlock}${skill}`,
  });
}
