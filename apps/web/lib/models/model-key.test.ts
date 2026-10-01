import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openModelKey,
  resetModelKeyCacheForTests,
  sealModelKey,
  secretKey,
} from "./model-key";

const SECRET_KEYS = ["WORKSPACE_MODEL_SECRET", "AUTH_SECRET", "NEXTAUTH_SECRET"] as const;

describe("model key sealing", () => {
  const previous = Object.fromEntries(SECRET_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    resetModelKeyCacheForTests();
    const env = process.env as Record<string, string | undefined>;
    for (const key of SECRET_KEYS) {
      const value = previous[key];
      if (value === undefined) delete env[key];
      else env[key] = value;
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

  it("caches scrypt derivation across decrypts with the same secret", () => {
    process.env.AUTH_SECRET = "unit-test-secret-for-cache";
    resetModelKeyCacheForTests();
    const sealed = sealModelKey("sk-test");
    const first = secretKey();
    const second = secretKey();
    expect(first).toBe(second);
    expect(openModelKey(sealed)).toBe("sk-test");
    expect(secretKey()).toBe(first);
  });
});
