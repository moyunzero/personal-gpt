import { describe, expect, it } from "vitest";

import { assertModelId } from "./workspace-models";

describe("assertModelId", () => {
  it("accepts a gateway model slug", () => {
    expect(assertModelId(" openai/gpt-4o-mini ")).toBe("openai/gpt-4o-mini");
  });

  it("rejects empty and secret-looking whitespace names", () => {
    expect(() => assertModelId("")).toThrow(/无效/);
    expect(() => assertModelId("has space")).toThrow(/无效/);
  });
});
