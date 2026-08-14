/**
 * Editor 子 Agent：Markdown 报告与引用整理；可注入 report-writer Skill（D-13）。
 */

import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { createAgent } from "langchain";

import { KB_CITATION_RULES, TOOL_RESULT_SAFETY } from "../prompts/fragments/kb-citation-rules";
import { AGENT_TOOL_CAPS } from "./caps";

export type AgentSkillOptions = {
  skillPrompt?: string;
};

export function createEditorAgent(model: LanguageModelLike, options: AgentSkillOptions = {}) {
  const skill = options.skillPrompt?.trim() ? `\n\n${options.skillPrompt.trim()}` : "";
  return createAgent({
    name: "editor",
    description: "将调研与分析结果整理为可读报告。",
    model,
    tools: [],
    systemPrompt: `你是 Editor。职责边界：报告撰写与表述润色，整合 Retriever/Researcher/Analyst 产出。

规则：
- 无外网工具（允许工具：无）。不要请求联网或 KB 检索。
- 用中文输出**面向用户的最终** Markdown 报告（这是用户会看到的终稿）。
- 报告至少包含：标题、简短说明（含知识库是否有依据）、核心对比（可用 Markdown 表格）、参考来源。禁止只回一句「已完成」。
- 即使知识库无命中或联网搜索降级/不可用，仍须直接给出完整对比报告（可基于公开常识并标明限制）；**禁止反问用户选方案或等待补充材料**。
- 「参考来源」必须使用上游 web_search 结果中的真实 URL，写成 Markdown 链接 \`[标题](https://...)\`；禁止编造或猜测 URL；若无真实 URL 则写「暂无可用网页来源（联网未启用或失败）」。
- **禁止编造具体版本号**（如 v0.x.y）；仅当工具摘要明确写出版本时才可引用，否则写「版本以官网为准」。
- 不要输出「任务规划」「等待子 Agent」；直接给完整报告。
- 禁止在正文复述工具协议名（含 KB_SEARCH_STATUS / NO_RELEVANT_HIT）；无命中只写「知识库未找到足够依据」。
- ${TOOL_RESULT_SAFETY}
- caps: editor tools = [${AGENT_TOOL_CAPS.editor.join(", ")}]。

${KB_CITATION_RULES}${skill}`,
  });
}
