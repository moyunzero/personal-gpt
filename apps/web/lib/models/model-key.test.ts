import { afterEach, describe, expect, it } from "vitest";

import { openModelKey, sealModelKey } from "./model-key";

const SECRET_KEYS = ["WORKSPACE_MODEL_SECRET", "AUTH_SECRET", "NEXTAUTH_SECRET"] as const;

describe("model key sealing", () => {
  const previous = Object.fromEntries(SECRET_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of SECRET_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("refuses to save when no application secret is configured", () => {
    for (const key of SECRET_KEYS) delete process.env[key];
    expect(() => sealModelKey("not-a-real-credential")).toThrow(/WORKSPACE_MODEL_SECRET/);
    process.env.AUTH_SECRET = "ci-build-placeholder";
    expect(() => sealModelKey("not-a-real-credential")).toThrow(/WORKSPACE_MODEL_SECRET/);
  });

  it("reads an older plaintext row unchanged", () => {
    expect(openModelKey("legacy-plain-row")).toBe("legacy-plain-row");
  });
});
