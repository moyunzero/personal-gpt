import { afterEach, describe, expect, it } from "vitest";

import { authorizeMetricsScrape } from "./metrics-auth";

describe("authorizeMetricsScrape", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("allows open scrape in non-production when token unset", () => {
    process.env.NODE_ENV = "development";
    delete process.env.METRICS_SCRAPE_TOKEN;
    expect(authorizeMetricsScrape(undefined, undefined)).toBe(true);
  });

  it("denies in production when token unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.METRICS_SCRAPE_TOKEN;
    expect(authorizeMetricsScrape(undefined, undefined)).toBe(false);
  });

  it("requires matching bearer or query token when configured", () => {
    process.env.NODE_ENV = "production";
    process.env.METRICS_SCRAPE_TOKEN = "secret";
    expect(authorizeMetricsScrape("Bearer secret", null)).toBe(true);
    expect(authorizeMetricsScrape(undefined, "secret")).toBe(true);
    expect(authorizeMetricsScrape("Bearer wrong", null)).toBe(false);
  });
});
