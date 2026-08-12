/**
 * 纯计算：入库压测指标聚合（无 I/O，可供 vitest）。
 */

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))]!;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface DocOutcome {
  /** 期望成功的样本 */
  expectSuccess: boolean;
  status: "ready" | "failed" | "timeout" | "upload_error";
  /** 上传发出 → 终态，毫秒 */
  latencyMs?: number;
  chunkCount?: number;
  /** BullMQ attemptsMade；未知则为 1 */
  attemptsMade?: number;
  vectorCount?: number;
}

export interface AggregatedIngestMetrics {
  total: number;
  ready: number;
  failed: number;
  timeout: number;
  uploadError: number;
  /** 仅统计 expectSuccess=true 的样本 */
  successRateExpected: number | null;
  /** 全体终态（ready+failed）中 ready 占比 */
  successRateAllTerminal: number | null;
  latencyMs: {
    n: number;
    p50: number | null;
    p95: number | null;
    mean: number | null;
  };
  /** 期望成功样本到终态（ready|failed）的时延，Astra 故障时仍有数 */
  latencyTerminalMs: {
    n: number;
    p50: number | null;
    p95: number | null;
    mean: number | null;
  };
  queue: {
    peakWaiting: number;
    peakActive: number;
    waitMs: { n: number; p50: number | null; p95: number | null; mean: number | null };
  };
  reconcile: {
    checked: number;
    mismatched: number;
    mismatchRate: number | null;
  };
  cost: {
    finalChunks: number;
    estimatedEmbedChunkCalls: number;
    wasteRatio: number | null;
    estimatedTokens: number;
    estimatedUsd: number | null;
  };
}

export function aggregateIngestMetrics(
  outcomes: DocOutcome[],
  queue: {
    peakWaiting: number;
    peakActive: number;
    waitMs: number[];
  },
  options: {
    /** 每百万 token 美元价；未提供则 estimatedUsd=null */
    usdPerMillionTokens?: number;
    /** 估算：每 chunk 字符数 / 4 ≈ tokens */
    avgCharsPerChunk?: number;
  } = {},
): AggregatedIngestMetrics {
  const avgChars = options.avgCharsPerChunk ?? 900;
  const ready = outcomes.filter((o) => o.status === "ready");
  const failed = outcomes.filter((o) => o.status === "failed");
  const timeout = outcomes.filter((o) => o.status === "timeout");
  const uploadError = outcomes.filter((o) => o.status === "upload_error");

  const expected = outcomes.filter((o) => o.expectSuccess);
  const expectedTerminal = expected.filter((o) => o.status === "ready" || o.status === "failed");
  const expectedReady = expected.filter((o) => o.status === "ready");

  const allTerminal = outcomes.filter((o) => o.status === "ready" || o.status === "failed");

  const latenciesReady = outcomes
    .filter((o) => o.expectSuccess && o.status === "ready" && typeof o.latencyMs === "number")
    .map((o) => o.latencyMs!);
  const latenciesTerminal = outcomes
    .filter(
      (o) =>
        o.expectSuccess &&
        (o.status === "ready" || o.status === "failed") &&
        typeof o.latencyMs === "number",
    )
    .map((o) => o.latencyMs!);

  let mismatched = 0;
  let checked = 0;
  for (const o of ready) {
    if (typeof o.vectorCount !== "number" || typeof o.chunkCount !== "number") continue;
    checked += 1;
    if (o.vectorCount !== o.chunkCount) mismatched += 1;
  }

  let finalChunks = 0;
  let estimatedEmbedChunkCalls = 0;
  for (const o of ready) {
    const chunks = o.chunkCount ?? 0;
    const attempts = Math.max(1, o.attemptsMade ?? 1);
    finalChunks += chunks;
    estimatedEmbedChunkCalls += attempts * chunks;
  }
  // 失败任务：每次 attempt 也大致打过 embed（偏乐观上界用 chunk 未知时跳过）
  for (const o of failed) {
    const chunks = o.chunkCount ?? 0;
    const attempts = Math.max(1, o.attemptsMade ?? 1);
    if (chunks > 0) estimatedEmbedChunkCalls += attempts * chunks;
  }

  const wasteRatio =
    estimatedEmbedChunkCalls > 0
      ? (estimatedEmbedChunkCalls - finalChunks) / estimatedEmbedChunkCalls
      : null;

  const estimatedTokens = Math.round((estimatedEmbedChunkCalls * avgChars) / 4);
  const estimatedUsd =
    options.usdPerMillionTokens != null
      ? (estimatedTokens / 1_000_000) * options.usdPerMillionTokens
      : null;

  return {
    total: outcomes.length,
    ready: ready.length,
    failed: failed.length,
    timeout: timeout.length,
    uploadError: uploadError.length,
    successRateExpected:
      expectedTerminal.length > 0 ? expectedReady.length / expectedTerminal.length : null,
    successRateAllTerminal:
      allTerminal.length > 0 ? ready.length / allTerminal.length : null,
    latencyMs: {
      n: latenciesReady.length,
      p50: percentile(latenciesReady, 50),
      p95: percentile(latenciesReady, 95),
      mean: mean(latenciesReady),
    },
    latencyTerminalMs: {
      n: latenciesTerminal.length,
      p50: percentile(latenciesTerminal, 50),
      p95: percentile(latenciesTerminal, 95),
      mean: mean(latenciesTerminal),
    },
    queue: {
      peakWaiting: queue.peakWaiting,
      peakActive: queue.peakActive,
      waitMs: {
        n: queue.waitMs.length,
        p50: percentile(queue.waitMs, 50),
        p95: percentile(queue.waitMs, 95),
        mean: mean(queue.waitMs),
      },
    },
    reconcile: {
      checked,
      mismatched,
      mismatchRate: checked > 0 ? mismatched / checked : null,
    },
    cost: {
      finalChunks,
      estimatedEmbedChunkCalls,
      wasteRatio,
      estimatedTokens,
      estimatedUsd,
    },
  };
}

export function formatMetricsMarkdown(
  metrics: AggregatedIngestMetrics,
  meta: { baseUrl: string; concurrencyHint: string; at: string },
): string {
  const pct = (v: number | null) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);
  const ms = (v: number | null) => (v == null ? "n/a" : `${Math.round(v)} ms`);
  const num = (v: number | null, digits = 4) => (v == null ? "n/a" : v.toFixed(digits));

  return `# Ingest bench metrics

- at: ${meta.at}
- baseUrl: ${meta.baseUrl}
- worker concurrency (config): ${meta.concurrencyHint}

## 1. 入库成功率

| 项 | 值 |
|----|----|
| 样本总数 | ${metrics.total} |
| ready | ${metrics.ready} |
| failed | ${metrics.failed} |
| timeout | ${metrics.timeout} |
| upload_error | ${metrics.uploadError} |
| 期望成功样本成功率 | ${pct(metrics.successRateExpected)} |
| 全体终态成功率 | ${pct(metrics.successRateAllTerminal)} |

## 2. 上传 → ready 时延（仅 ready）

| 项 | 值 |
|----|----|
| n | ${metrics.latencyMs.n} |
| P50 | ${ms(metrics.latencyMs.p50)} |
| P95 | ${ms(metrics.latencyMs.p95)} |
| mean | ${ms(metrics.latencyMs.mean)} |

## 2b. 上传 → 终态时延（ready|failed，含下游故障）

| 项 | 值 |
|----|----|
| n | ${metrics.latencyTerminalMs.n} |
| P50 | ${ms(metrics.latencyTerminalMs.p50)} |
| P95 | ${ms(metrics.latencyTerminalMs.p95)} |
| mean | ${ms(metrics.latencyTerminalMs.mean)} |

## 3. 队列等待

| 项 | 值 |
|----|----|
| peak waiting | ${metrics.queue.peakWaiting} |
| peak active | ${metrics.queue.peakActive} |
| wait n | ${metrics.queue.waitMs.n} |
| wait P50 | ${ms(metrics.queue.waitMs.p50)} |
| wait P95 | ${ms(metrics.queue.waitMs.p95)} |
| wait mean | ${ms(metrics.queue.waitMs.mean)} |

## 4. ready ↔ 向量条数不一致率

| 项 | 值 |
|----|----|
| 抽检 ready 数 | ${metrics.reconcile.checked} |
| 不一致数 | ${metrics.reconcile.mismatched} |
| 不一致率 | ${pct(metrics.reconcile.mismatchRate)} |

## 5. Embedding 成本 / 重试浪费（估算）

| 项 | 值 |
|----|----|
| 最终 chunk 数 | ${metrics.cost.finalChunks} |
| 估算 embed chunk 调用 | ${metrics.cost.estimatedEmbedChunkCalls} |
| 重试浪费比例 | ${pct(metrics.cost.wasteRatio)} |
| 估算 tokens | ${metrics.cost.estimatedTokens} |
| 估算 USD | ${metrics.cost.estimatedUsd == null ? "n/a（未设 BENCH_EMBED_USD_PER_1M）" : `$${num(metrics.cost.estimatedUsd)}`} |

> 浪费比例 = (估算 embed 调用 − 最终 chunk) / 估算 embed 调用；每次 Bull attempt 按「整文 chunk 再 embed 一次」估算。
`;
}
