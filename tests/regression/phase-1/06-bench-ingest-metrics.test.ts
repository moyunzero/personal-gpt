import { describe, expect, it } from "vitest";

import {
  aggregateIngestMetrics,
  percentile,
  type DocOutcome,
} from "../../../script/bench-ingest-metrics.lib";

describe("bench-ingest-metrics.lib", () => {
  it("percentile P95", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile([], 95)).toBeNull();
  });

  it("aggregates five enterprise metrics", () => {
    const outcomes: DocOutcome[] = [
      {
        expectSuccess: true,
        status: "ready",
        latencyMs: 1000,
        chunkCount: 4,
        attemptsMade: 1,
        vectorCount: 4,
      },
      {
        expectSuccess: true,
        status: "ready",
        latencyMs: 2000,
        chunkCount: 6,
        attemptsMade: 2,
        vectorCount: 6,
      },
      {
        expectSuccess: true,
        status: "failed",
        latencyMs: 500,
        chunkCount: 0,
        attemptsMade: 3,
      },
      {
        expectSuccess: false,
        status: "failed",
        latencyMs: 300,
        attemptsMade: 3,
      },
    ];

    const m = aggregateIngestMetrics(outcomes, {
      peakWaiting: 5,
      peakActive: 2,
      waitMs: [10, 20, 100],
    });

    expect(m.ready).toBe(2);
    expect(m.failed).toBe(2);
    expect(m.successRateExpected).toBeCloseTo(2 / 3);
    expect(m.latencyMs.p95).toBe(2000);
    expect(m.latencyTerminalMs.n).toBe(3);
    expect(m.queue.peakWaiting).toBe(5);
    expect(m.reconcile.mismatchRate).toBe(0);
    // ready: 1*4 + 2*6 = 16 embed calls; final chunks 10; waste (16-10)/16
    expect(m.cost.finalChunks).toBe(10);
    expect(m.cost.estimatedEmbedChunkCalls).toBe(16);
    expect(m.cost.wasteRatio).toBeCloseTo(6 / 16);
  });

  it("detects vector mismatch", () => {
    const m = aggregateIngestMetrics(
      [
        {
          expectSuccess: true,
          status: "ready",
          chunkCount: 5,
          vectorCount: 3,
          attemptsMade: 1,
          latencyMs: 100,
        },
      ],
      { peakWaiting: 0, peakActive: 0, waitMs: [] },
    );
    expect(m.reconcile.mismatchRate).toBe(1);
  });
});
