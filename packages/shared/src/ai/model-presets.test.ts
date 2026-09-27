import { describe, expect, it } from "vitest";

import { CHAT_MODEL_VENDORS, DEFAULT_CHAT_MODEL_ID, unknownModelMessage } from "./model-presets";

describe("CHAT_MODEL_VENDORS", () => {
  it("orders platforms by usage and keeps provider names separate from model names", () => {
    expect(CHAT_MODEL_VENDORS.map((vendor) => vendor.label)).toEqual([
      "OpenAI",
      "Google",
      "Anthropic",
      "Kimi",
      "xAI",
      "Groq",
    ]);
    const free = CHAT_MODEL_VENDORS.flatMap((vendor) => vendor.models).find(
      (model) => model.modelId === DEFAULT_CHAT_MODEL_ID,
    );
    expect(free?.tier).toBe("free");
  });

  it("rejects a model id the provider did not list", () => {
    expect(unknownModelMessage("gpt-6-astra", ["gpt-6-sol"])).toMatch(/没有/);
    expect(unknownModelMessage("gpt-6-sol", ["gpt-6-sol"])).toBeNull();
  });
});
