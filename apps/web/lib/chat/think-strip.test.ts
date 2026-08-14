import { describe, expect, it } from "vitest";

import { ThinkStripFilter } from "./think-strip";

const OPEN = "<" + "think" + ">";
const CLOSE = "<" + "/think" + ">";

function strip(chunks: string[]): string {
  const filter = new ThinkStripFilter();
  let out = "";
  for (const chunk of chunks) {
    out += filter.feed(chunk);
  }
  out += filter.flush();
  return out;
}

describe("ThinkStripFilter", () => {
  it("passes through text without think blocks", () => {
    expect(strip(["你好", "世界"])).toBe("你好世界");
  });

  it("removes a complete think block in one chunk", () => {
    expect(strip([OPEN + "内部推理" + CLOSE + "可见回答"])).toBe("可见回答");
  });

  it("handles think block split across chunks", () => {
    expect(strip([OPEN + "推理", CLOSE, "正文"])).toBe("正文");
  });

  it("handles partial opening tag at chunk boundary", () => {
    expect(strip(["前缀<", "think>隐藏" + CLOSE, "后"])).toBe("前缀后");
  });

  it("returns empty when response is think-only", () => {
    expect(strip([OPEN + "只有思考" + CLOSE])).toBe("");
  });

  it("strips leading whitespace after think block", () => {
    expect(strip([OPEN + "x" + CLOSE + "\n\n回答"])).toBe("回答");
  });
});
