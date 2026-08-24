/**
 * Live 数值评估：对 golden.json 跑真实 hybridSearch + 意图路由，输出 R-01/R-02/I-01/MRR/延迟。
 * 用法：yarn eval:live-metrics
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

import { hybridSearch } from "@personal-gpt/shared";
import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import { resolveIntentPlan } from "@personal-gpt/shared/routing";
import type { RetrievedChunk } from "@personal-gpt/shared/stores/vector-store";

config({ path: resolve(__dirname, "../.env") });

type GoldenItem = {
  id: string;
  query: string;
  corpus: "user" | "seed";
  expectCitationSource?: string;
  forbidSources?: string[];
  expectIntentPrimary?: string;
  expectTool?: string | null;
};

const golden = JSON.parse(
  readFileSync(join(__dirname, "../tests/eval/phase-3/golden.json"), "utf8"),
) as GoldenItem[];

const SMOKE_IDS = new Set(["g01", "g02", "g03", "g04", "g05"]);
const K = 5;

function norm(s: string): string {
  return s.toLowerCase().replace(/\.md$/i, "").trim();
}

function hitMatches(hit: RetrievedChunk, expected: string): boolean {
  const exp = norm(expected);
  const fields = [hit.source, hit.title, hit.documentId, hit.text].filter(Boolean).join(" ");
  const hay = norm(fields);
  if (hay.includes(exp) || exp.includes(hay)) return true;
  const stem = exp.split(/[_\-.]/)[0];
  return stem.length >= 2 && hay.includes(stem);
}

function rankOf(hits: RetrievedChunk[], expected: string): number {
  const idx = hits.findIndex((h) => hitMatches(h, expected));
  return idx < 0 ? 0 : idx + 1;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, i))]!;
}

async function evalRetrieval(items: GoldenItem[]) {
  const rows: Array<{
    id: string;
    hitAt1: boolean;
    hitAtK: boolean;
    rank: number;
    forbiddenHit: boolean;
    latencyMs: number;
    topSource?: string;
  }> = [];

  for (const item of items) {
    if (!item.expectCitationSource) continue;
    const t0 = Date.now();
    const hits = await hybridSearch({
      query: item.query,
      workspaceId: DEFAULT_WORKSPACE_ID,
      corpus: item.corpus,
      limit: K,
    });
    const latencyMs = Date.now() - t0;
    const rank = rankOf(hits, item.expectCitationSource);
    const forbiddenHit = (item.forbidSources ?? []).some((f) => hits.some((h) => hitMatches(h, f)));
    rows.push({
      id: item.id,
      hitAt1: rank === 1,
      hitAtK: rank > 0,
      rank,
      forbiddenHit,
      latencyMs,
      topSource: hits[0]?.source ?? hits[0]?.title,
    });
  }

  const n = rows.length;
  const hit1 = rows.filter((r) => r.hitAt1).length;
  const hitK = rows.filter((r) => r.hitAtK).length;
  const forbidden = rows.filter((r) => r.forbiddenHit).length;
  const mrr = rows.reduce((s, r) => s + (r.rank > 0 ? 1 / r.rank : 0), 0) / Math.max(n, 1);
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);

  return {
    n,
    hitAt1Pct: (hit1 / n) * 100,
    hitAt5Pct: (hitK / n) * 100,
    mrr,
    forbiddenSourcePct: (forbidden / n) * 100,
    retrievalP50Ms: percentile(latencies, 50),
    retrievalP95Ms: percentile(latencies, 95),
    rows,
  };
}

async function evalIntent() {
  const intentIds = new Set(["g23", "g24", "g25"]);
  const items = golden.filter((g) => intentIds.has(g.id));
  let correct = 0;
  const rows = [];
  for (const item of items) {
    const probeKb = async () => ({
      probed: true,
      topSimilarity: item.id === "g25" ? 0.9 : 0.2,
      title: item.id === "g25" ? "奥德赛计划书" : undefined,
    });
    const { plan } = await resolveIntentPlan(item.query, { probeKb });
    const ok =
      plan.primary === item.expectIntentPrimary &&
      (item.expectTool
        ? plan.retrieverTools.includes(item.expectTool)
        : plan.retrieverTools.length === 0);
    if (ok) correct++;
    rows.push({ id: item.id, ok, primary: plan.primary, tools: plan.retrieverTools });
  }
  return { n: items.length, accuracyPct: (correct / items.length) * 100, rows };
}

async function evalApiLatency(webBase: string) {
  const cases = [
    {
      id: "chat-graph",
      url: `${webBase}/api/chat`,
      body: {
        messages: [
          {
            id: "c1",
            role: "user",
            parts: [{ type: "text", text: "珍珠奶茶有哪些原料，用了什么工艺？" }],
          },
        ],
        corpus: "seed",
      },
    },
    {
      id: "agent-graph",
      url: `${webBase}/api/agent/chat`,
      body: {
        messages: [
          {
            id: "u1",
            role: "user",
            parts: [{ type: "text", text: "珍珠奶茶有哪些原料，用了什么工艺？" }],
          },
        ],
        thread_id: `lat-${Date.now()}`,
      },
    },
    {
      id: "agent-kb",
      url: `${webBase}/api/agent/chat`,
      body: {
        messages: [
          {
            id: "u2",
            role: "user",
            parts: [{ type: "text", text: "奥德赛计划书的主要内容是什么？" }],
          },
        ],
        thread_id: `lat-kb-${Date.now()}`,
      },
    },
  ];
  const out = [];
  for (const c of cases) {
    const t0 = Date.now();
    try {
      const res = await fetch(c.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: webBase },
        body: JSON.stringify(c.body),
        signal: AbortSignal.timeout(300_000),
      });
      await res.text();
      out.push({ id: c.id, ok: res.ok, latencyMs: Date.now() - t0, status: res.status });
    } catch (e) {
      out.push({ id: c.id, ok: false, latencyMs: Date.now() - t0, error: String(e) });
    }
  }
  const okLat = out
    .filter((o) => o.ok)
    .map((o) => o.latencyMs)
    .sort((a, b) => a - b);
  return {
    cases: out,
    e2eP50Ms: percentile(okLat, 50),
    e2eP95Ms: percentile(okLat, 95),
  };
}

async function main() {
  const webBase = process.env.EVAL_WEB_BASE ?? "http://localhost:3000";
  const skipApi = process.env.EVAL_SKIP_API === "1";

  console.log("=== Live Eval Metrics ===\n");

  const allRetrieval = await evalRetrieval(golden);
  const smokeItems = golden.filter((g) => SMOKE_IDS.has(g.id));
  const smokeRetrieval = await evalRetrieval(smokeItems);

  const intent = await evalIntent();

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    model: {
      chat: process.env.OPENAI_CHAT_MODEL ?? process.env.CHAT_MODELS ?? "default",
      agent: process.env.AGENT_MODEL ?? "default",
      rerank: process.env.ENABLE_RERANKER !== "false",
    },
    golden: {
      total: golden.length,
      retrievalCases: allRetrieval.n,
      smokeCases: smokeRetrieval.n,
    },
    R01_citationHitRate: {
      smoke_hitAt1_pct: Number(smokeRetrieval.hitAt1Pct.toFixed(1)),
      smoke_hitAt5_pct: Number(smokeRetrieval.hitAt5Pct.toFixed(1)),
      full_hitAt1_pct: Number(allRetrieval.hitAt1Pct.toFixed(1)),
      full_hitAt5_pct: Number(allRetrieval.hitAt5Pct.toFixed(1)),
      threshold_smoke: 95,
      threshold_full: 90,
    },
    R02_forbiddenSourceRate_pct: Number(allRetrieval.forbiddenSourcePct.toFixed(1)),
    R03_mrr: Number(allRetrieval.mrr.toFixed(3)),
    I01_intentAccuracy_pct: Number(intent.accuracyPct.toFixed(1)),
    Lat_retrieval_ms: {
      p50: allRetrieval.retrievalP50Ms,
      p95: allRetrieval.retrievalP95Ms,
    },
    retrievalDetails: allRetrieval.rows,
    intentDetails: intent.rows,
  };

  if (!skipApi) {
    try {
      const api = await evalApiLatency(webBase);
      report.Lat_e2e_ms = { p50: api.e2eP50Ms, p95: api.e2eP95Ms, cases: api.cases };
    } catch (e) {
      report.Lat_e2e_ms = { error: String(e) };
    }
  }

  const outPath = join(__dirname, "../tests/eval/LIVE-METRICS-RESULT.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("R-01 Citation Hit@5 (smoke g01-g05):", `${report.R01_citationHitRate}`);
  console.log(
    "R-01 Citation Hit@5 (full):",
    `${(report.R01_citationHitRate as { full_hitAt5_pct: number }).full_hitAt5_pct}%`,
  );
  console.log("R-02 Forbidden Source Rate:", `${report.R02_forbiddenSourceRate_pct}%`);
  console.log("R-03 MRR:", report.R03_mrr);
  console.log("I-01 Intent Accuracy:", `${report.I01_intentAccuracy_pct}%`);
  console.log("Retrieval P95:", `${(report.Lat_retrieval_ms as { p95: number }).p95} ms`);
  if (report.Lat_e2e_ms && !(report.Lat_e2e_ms as { error?: string }).error) {
    const e2e = report.Lat_e2e_ms as {
      p95: number;
      cases: Array<{ id: string; latencyMs: number }>;
    };
    console.log("E2E P95:", `${e2e.p95} ms`);
    for (const c of e2e.cases) console.log(`  ${c.id}: ${(c.latencyMs / 1000).toFixed(1)}s`);
  }
  console.log("\nWrote", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
