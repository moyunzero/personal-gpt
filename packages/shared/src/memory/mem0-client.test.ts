import { describe, expect, it } from "vitest";

import { extractStableFactsFromUserText } from "./mem0-client";

describe("extractStableFactsFromUserText", () => {
  it("captures explicit durable preferences", () => {
    expect(extractStableFactsFromUserText("请记住：回答要简洁")).toEqual(["回答要简洁"]);
    expect(extractStableFactsFromUserText("我喜欢简短回答")).toEqual(["简短回答"]);
    expect(extractStableFactsFromUserText("我希望你以后用中文回答")).toEqual(["用中文回答"]);
  });

  it("does not capture arbitrary task requests", () => {
    expect(extractStableFactsFromUserText("我希望你帮我写一段 SQL")).toEqual([]);
    expect(extractStableFactsFromUserText("我希望你总结这篇文章")).toEqual([]);
  });

  it("does not capture sensitive values as stable facts", () => {
    expect(extractStableFactsFromUserText("我的密码是 hunter2")).toEqual([]);
    expect(extractStableFactsFromUserText("请记住我的 API key 是 sk-live-abc")).toEqual([]);
  });
});
