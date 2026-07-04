const OPEN_TAG = "<" + "think" + ">";
const CLOSE_TAG = "<" + "/think" + ">";

/** 保留 carry 末尾可能与 tag 前缀匹配的部分，避免跨 chunk 截断标签 */
function splitEmitAndPartialTag(text: string, tag: string): { emit: string; keep: string } {
  for (let len = Math.min(text.length, tag.length - 1); len >= 1; len--) {
    const suffix = text.slice(-len);
    if (tag.startsWith(suffix)) {
      return { emit: text.slice(0, -len), keep: suffix };
    }
  }
  return { emit: text, keep: "" };
}

/**
 * 流式过滤 Qwen 等模型输出的  思考块，仅放行对用户可见的正文。
 */
export class ThinkStripFilter {
  private inThink = false;
  private carry = "";

  /** 喂入一段 delta，返回应写入 UI 的可见文本（可能为空字符串） */
  feed(delta: string): string {
    this.carry += delta;
    let out = "";

    while (this.carry.length > 0) {
      if (this.inThink) {
        const closeIdx = this.carry.indexOf(CLOSE_TAG);
        if (closeIdx === -1) {
          this.carry = splitEmitAndPartialTag(this.carry, CLOSE_TAG).keep;
          break;
        }
        this.carry = this.carry.slice(closeIdx + CLOSE_TAG.length).replace(/^\s+/, "");
        this.inThink = false;
        continue;
      }

      const openIdx = this.carry.indexOf(OPEN_TAG);
      if (openIdx === -1) {
        const { emit, keep } = splitEmitAndPartialTag(this.carry, OPEN_TAG);
        out += emit;
        this.carry = keep;
        break;
      }

      out += this.carry.slice(0, openIdx);
      this.carry = this.carry.slice(openIdx + OPEN_TAG.length);
      this.inThink = true;
    }

    return out;
  }

  /** 流结束时刷出 carry 中剩余可见文本（不在 think 块内时） */
  flush(): string {
    if (this.inThink) {
      this.carry = "";
      this.inThink = false;
      return "";
    }
    const rest = this.carry;
    this.carry = "";
    return rest;
  }
}
