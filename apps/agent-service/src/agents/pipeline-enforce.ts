/**
 * 多步清单强制续跑：提示词不够时由代码补刀。
 */

import type { SpecialistName } from "./supervisor.prompt";

export function missingRequiredSpecialists(
  required: SpecialistName[],
  ran: Iterable<string>,
): SpecialistName[] {
  const done = new Set([...ran].map((n) => n.toLowerCase().replace(/^transfer_to_/, "")));
  return required.filter((r) => !done.has(r));
}

export function nextRequiredSpecialist(
  required: SpecialistName[],
  ran: Iterable<string>,
): SpecialistName | null {
  return missingRequiredSpecialists(required, ran)[0] ?? null;
}

export type ForceContinueOptions = {
  /** 知识库已确认无有效命中 */
  kbNoRelevantHit?: boolean;
};

/** 注入 HumanMessage，迫使 Supervisor 继续 transfer */
export function buildForceContinueNudge(
  next: SpecialistName,
  missing: SpecialistName[],
  options: ForceContinueOptions = {},
): string {
  const lines = [
    "[系统强制续跑] 强制调度清单尚未完成，禁止文字收尾或「等待」。",
    `请立即调用 transfer_to_${next}。`,
    `仍缺失：${missing.join(", ")}。`,
  ];
  if (next === "editor") {
    lines.push(
      "Editor 须输出面向用户的完整中文 Markdown 终稿（含标题、对比表、参考来源），禁止只回一句「已完成」。",
    );
    if (options.kbNoRelevantHit) {
      lines.push(
        "知识库状态=无命中：报告中必须写「知识库未找到足够依据」；参考资料禁止出现 DOC-*、DocumentId、内部文档号；只能引用 web_search 返回的真实标题与 URL；没有网页 URL 就写「暂无可用网页来源」。",
      );
    } else {
      lines.push(
        "禁止编造 DOC-* / 假 DocumentId；只能使用上游 kb_search HIT 或 web_search 的真实来源。",
      );
    }
  } else {
    lines.push("完成后若仍有缺失项，继续按清单 transfer，不要自行结束。");
  }
  return lines.join(" ");
}

export const MAX_FORCE_CONTINUE_ROUNDS = 3;

/** Supervisor 交接话术，不是终稿 */
export function isHandoffNoiseText(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return true;
  if (
    compact.length < 280 &&
    /请等待|已将编辑任务委派|强制调度步骤|后续请等待|transfer_to_/.test(text)
  ) {
    return true;
  }
  if (compact.length < 120 && /已完成全部子Agent|祝您使用愉快/.test(compact)) {
    return true;
  }
  return false;
}
