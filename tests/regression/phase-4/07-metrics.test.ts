/**
 * Phase 4 regression #7 — Prometheus /metrics endpoints (PROD-05 / D-51–D-54).
 */
import { describe, expect, it } from "vitest";

import { metricsContentType, metricsText } from "@/lib/metrics";

describe("Phase 4 regression #7: metrics exposition", () => {
  it("web metrics registry returns Prometheus text format", async () => {
    const body = await metricsText();
    expect(body).toMatch(/# HELP http_requests_total/);
    expect(body).toMatch(/# TYPE http_requests_total counter/);
    expect(body).toMatch(/# HELP rate_limit_exceeded_total/);
    expect(metricsContentType()).toMatch(/text\/plain/);
  });
});
