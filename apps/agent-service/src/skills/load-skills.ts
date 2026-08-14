/**
 * 手写 Skills loader（D-00c / D-12 / D-13）。
 * 仅读仓库内 skills 根目录；不引入 deepagents FilesystemBackend。
 */

import fs from "node:fs";
import path from "node:path";

export type LoadedSkill = {
  name: string;
  description: string;
  body: string;
};

export type LoadSkillsOptions = {
  /** 仅测试可覆盖；生产固定 skills 根目录 */
  skillsRoot?: string;
  /** 覆盖 ENABLED_SKILLS 解析结果 */
  enabledNames?: string[];
};

const DEFAULT_ENABLED = ["kb-retrieval", "web-research", "report-writer"] as const;

/** 默认 skills 根：apps/agent-service/skills（相对本文件编译后路径） */
export function defaultSkillsRoot(): string {
  return path.resolve(__dirname, "../../skills");
}

function parseEnabledNames(raw: string | undefined): string[] {
  const source = raw ?? DEFAULT_ENABLED.join(",");
  return source
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 解析 SKILL.md：YAML frontmatter（name/description）+ body。
 * 极简解析，不引入 gray-matter。
 */
export function parseSkillMarkdown(raw: string): LoadedSkill {
  const trimmed = raw.replace(/^\uFEFF/, "");
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { name: "", description: "", body: trimmed.trim() };
  }
  const fm = match[1];
  const body = match[2].trim();
  let name = "";
  let description = "";
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (key === "name") name = val;
    if (key === "description") description = val;
  }
  return { name, description, body };
}

/**
 * 按 ENABLED_SKILLS 加载技能；缺失目录 fail-open（跳过 + warn），不抛垮进程。
 * 路径限制在 skillsRoot 下 join(name, SKILL.md)，不接受用户路径参数（T-02-03-01）。
 */
export function loadEnabledSkills(options: LoadSkillsOptions = {}): LoadedSkill[] {
  const root = options.skillsRoot ?? defaultSkillsRoot();
  const names = options.enabledNames ?? parseEnabledNames(process.env.ENABLED_SKILLS);

  const out: LoadedSkill[] = [];
  for (const name of names) {
    // 拒绝路径穿越
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
      console.warn(`[skills] skip invalid skill name: ${name}`);
      continue;
    }
    const filePath = path.join(root, name, "SKILL.md");
    if (!fs.existsSync(filePath)) {
      console.warn(`[skills] skip missing skill: ${name} (${filePath})`);
      continue;
    }
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = parseSkillMarkdown(raw);
      out.push({
        name: parsed.name || name,
        description: parsed.description,
        body: parsed.body,
      });
    } catch (err) {
      console.warn(`[skills] skip unreadable skill: ${name}`, err);
    }
  }
  return out;
}

/** 生成可追加到 systemPrompt 的 Skills 文本块 */
export function formatSkillsForPrompt(skills: LoadedSkill[]): string {
  if (!skills.length) return "";
  const blocks = skills.map((s) => {
    const header = s.description ? `### ${s.name} — ${s.description}` : `### ${s.name}`;
    return `${header}\n\n${s.body}`.trim();
  });
  return [
    "## Skills（流程指南，不是子 Agent）",
    "",
    "以下 Skills 仅指导流程与委派；切勿将 skill 名当作 handoff / subagent 目标。",
    "",
    ...blocks,
  ].join("\n");
}

/** 按 skill name 取单个已加载技能正文块（注入专用 Agent） */
export function formatSkillForPrompt(skill: LoadedSkill | undefined): string {
  if (!skill) return "";
  return formatSkillsForPrompt([skill]);
}

export function findSkill(skills: LoadedSkill[], name: string): LoadedSkill | undefined {
  return skills.find((s) => s.name === name);
}
