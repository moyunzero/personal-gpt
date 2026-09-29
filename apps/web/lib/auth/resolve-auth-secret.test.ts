import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthSecret } from "./resolve-auth-secret";

const ENV_KEYS = ["AUTH_SECRET", "NEXTAUTH_SECRET", "NODE_ENV", "NEXT_PHASE"] as const;

describe("resolveAuthSecret", () => {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("throws in production when secret is missing or placeholder", () => {
    expect(() =>
      resolveAuthSecret({
        NODE_ENV: "production",
        AUTH_SECRET: "ci-build-placeholder",
      }),
    ).toThrow(/AUTH_SECRET|NEXTAUTH_SECRET/);

    expect(() =>
      resolveAuthSecret({
        NODE_ENV: "production",
        AUTH_SECRET: "",
      }),
    ).toThrow(/AUTH_SECRET|NEXTAUTH_SECRET/);

    const secretValue = "super-secret-should-not-leak";
    try {
      resolveAuthSecret({
        NODE_ENV: "production",
        AUTH_SECRET: "ci-build-placeholder",
      });
      expect.unreachable("expected throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(secretValue);
      expect(message).not.toMatch(/super-secret/);
    }
  });

  it("allows placeholder during next production build", () => {
    expect(
      resolveAuthSecret({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
        AUTH_SECRET: "ci-build-placeholder",
      }),
    ).toBe("ci-build-placeholder");
  });

  it("allows placeholder outside production", () => {
    expect(
      resolveAuthSecret({
        NODE_ENV: "development",
        AUTH_SECRET: "ci-build-placeholder",
      }),
    ).toBe("ci-build-placeholder");

    expect(
      resolveAuthSecret({
        NODE_ENV: "test",
      }),
    ).toBe("ci-build-placeholder");
  });

  it("returns trimmed AUTH_SECRET or NEXTAUTH_SECRET", () => {
    expect(
      resolveAuthSecret({
        NODE_ENV: "production",
        AUTH_SECRET: "  real-auth-secret  ",
      }),
    ).toBe("real-auth-secret");

    expect(
      resolveAuthSecret({
        NODE_ENV: "production",
        NEXTAUTH_SECRET: "  nextauth-secret  ",
      }),
    ).toBe("nextauth-secret");
  });
});
