/**
 * loadEnabledSkills: ENABLED_SKILLS -> skills/<name>/SKILL.md (D-12/D-13)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { formatSkillsForPrompt, loadEnabledSkills, parseSkillMarkdown } from "./load-skills";

const REAL_SKILLS_ROOT = path.resolve(__dirname, "../../skills");

describe("parseSkillMarkdown", () => {
  it("extracts name, description, and body from frontmatter", () => {
    const raw = `---
name: demo-skill
description: 演示技能
---

# 标题

正文一行。
`;
    const parsed = parseSkillMarkdown(raw);
    expect(parsed.name).toBe("demo-skill");
    expect(parsed.description).toBe("演示技能");
    expect(parsed.body).toContain("# 标题");
    expect(parsed.body).toContain("正文一行。");
  });
});

describe("loadEnabledSkills", () => {
  const prev = process.env.ENABLED_SKILLS;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.ENABLED_SKILLS;
    } else {
      process.env.ENABLED_SKILLS = prev;
    }
  });

  it("loads three skills by default from repo skills root", () => {
    delete process.env.ENABLED_SKILLS;
    const skills = loadEnabledSkills({ skillsRoot: REAL_SKILLS_ROOT });
    expect(skills).toHaveLength(3);
    expect(skills.map((s) => s.name).sort()).toEqual([
      "kb-retrieval",
      "report-writer",
      "web-research",
    ]);
    for (const s of skills) {
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it("loads only kb-retrieval when ENABLED_SKILLS=kb-retrieval", () => {
    process.env.ENABLED_SKILLS = "kb-retrieval";
    const skills = loadEnabledSkills({ skillsRoot: REAL_SKILLS_ROOT });
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("kb-retrieval");
  });

  it("fail-open: skips missing skill dirs without throwing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
    try {
      fs.mkdirSync(path.join(tmp, "kb-retrieval"));
      fs.writeFileSync(
        path.join(tmp, "kb-retrieval", "SKILL.md"),
        `---
name: kb-retrieval
description: ok
---

body
`,
        "utf8",
      );
      process.env.ENABLED_SKILLS = "kb-retrieval,missing-skill,web-research";
      const skills = loadEnabledSkills({ skillsRoot: tmp });
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe("kb-retrieval");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("formatSkillsForPrompt", () => {
  it("renders a prompt block with skill names", () => {
    const text = formatSkillsForPrompt([
      {
        name: "kb-retrieval",
        description: "KB",
        body: "流程说明",
      },
    ]);
    expect(text).toContain("kb-retrieval");
    expect(text).toContain("流程说明");
    expect(text).toContain("Skills");
  });
});
