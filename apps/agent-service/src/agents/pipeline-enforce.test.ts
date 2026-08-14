/**
 * 多步强制续跑单测。
 */
import { describe, expect, it } from "vitest";

import {
  buildForceContinueNudge,
  isHandoffNoiseText,
  missingRequiredSpecialists,
  nextRequiredSpecialist,
} from "./pipeline-enforce";

describe("pipeline-enforce", () => {
  it("computes missing specialists in order", () => {
    const required = ["retriever", "researcher", "editor"] as const;
    expect(missingRequiredSpecialists([...required], ["retriever"])).toEqual([
      "researcher",
      "editor",
    ]);
    expect(
      nextRequiredSpecialist([...required], ["retriever", "researcher"]),
    ).toBe("editor");
    expect(
      nextRequiredSpecialist([...required], ["retriever", "researcher", "editor"]),
    ).toBeNull();
  });

  it("nudge tells supervisor to transfer_to next", () => {
    const text = buildForceContinueNudge("editor", ["editor"]);
    expect(text).toMatch(/transfer_to_editor/);
    expect(text).toMatch(/禁止编造 DOC-\*|假 DocumentId/);
  });

  it("kb miss nudge forbids DOC-* and requires 知识库未找到", () => {
    const text = buildForceContinueNudge("editor", ["editor"], {
      kbNoRelevantHit: true,
    });
    expect(text).toMatch(/知识库未找到足够依据/);
    expect(text).toMatch(/禁止出现 DOC-\*/);
  });

  it("detects handoff wait text as noise", () => {
    expect(
      isHandoffNoiseText(
        "已将编辑任务委派给 editor，请等待其完成报告撰写。(已完成所有强制调度步骤，后续请等待 editor 输出最终报告。)",
      ),
    ).toBe(true);
    expect(
      isHandoffNoiseText(
        "# LangGraph 与 AutoGen 对比报告\n\n## 执行摘要\n- 要点一\n- 要点二\n",
      ),
    ).toBe(false);
  });
});
