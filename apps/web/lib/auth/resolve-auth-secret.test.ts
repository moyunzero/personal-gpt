import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthSecret } from "./resolve-auth-secret";

const ENV_KEYS = [
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "NODE_ENV",
  "NEXT_PHASE",
  "ALLOW_AUTH_SECRET_PLACEHOLDER",
] as const;

describe("resolveAuthSecret", () => {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    const env = process.env as Record<string, string | undefined>;
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete env[key];
      else env[key] = value;
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

  it("rejects NEXT_PHASE alone in production runtime (WR-05)", () => {
    expect(() =>
      resolveAuthSecret({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
        AUTH_SECRET: "ci-build-placeholder",
      }),
    ).toThrow(/AUTH_SECRET|NEXTAUTH_SECRET/);
  });

  it("allows placeholder when NEXT_PHASE set and argv includes build (next build)", () => {
    const argv = process.argv.slice();
    process.argv.push("build");
    try {
      expect(
        resolveAuthSecret({
          NODE_ENV: "production",
          NEXT_PHASE: "phase-production-build",
          AUTH_SECRET: "ci-build-placeholder",
        }),
      ).toBe("ci-build-placeholder");
    } finally {
      process.argv.length = 0;
      process.argv.push(...argv);
    }
  });

  it("allows placeholder with ALLOW_AUTH_SECRET_PLACEHOLDER=1 (CI/build)", () => {
    expect(
      resolveAuthSecret({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
        ALLOW_AUTH_SECRET_PLACEHOLDER: "1",
        AUTH_SECRET: "ci-build-placeholder",
      }),
    ).toBe("ci-build-placeholder");

    expect(
      resolveAuthSecret({
        NODE_ENV: "production",
        ALLOW_AUTH_SECRET_PLACEHOLDER: "1",
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
