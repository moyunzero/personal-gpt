/**
 * 异步入库五项企业指标压测（需本机已起 web + worker + Redis + PG + Astra）。
 *
 * 用法：
 *   yarn docker:up && yarn dev:web & yarn dev:worker &
 *   yarn bench:ingest
 *
 * 环境变量（可选）：
 *   BENCH_BASE_URL=http://localhost:3000
 *   BENCH_SMALL_N=10          # 期望成功的小 Markdown 数量
 *   BENCH_INCLUDE_CORRUPT=1   # 附带损坏 PDF（期望 failed）
 *   BENCH_TIMEOUT_MS=300000
 *   BENCH_POLL_MS=1000
 *   BENCH_CLEANUP=1           # 结束后删除本次文档
 *   BENCH_EMBED_USD_PER_1M=   # 每百万 token 单价，用于估算 USD
 *   KB_ADMIN_TOKEN=           # 若服务端启用了鉴权
 *   REDIS_URL / ASTRA_*       # 队列采样与向量对账
 */
import { config } from "dotenv";
import { resolve, join } from "node:path";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { Queue } from "bullmq";
import { DataAPIClient } from "@datastax/astra-db-ts";
import { Client as PgClient } from "pg";

import { INGEST_QUEUE_NAME } from "@personal-gpt/shared/constants/queue";
import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import { createVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";

import {
  aggregateIngestMetrics,
  formatMetricsMarkdown,
  type DocOutcome,
} from "./bench-ingest-metrics.lib";

config({ path: resolve(__dirname, "../.env") });

const BASE = process.env.BENCH_BASE_URL ?? "http://localhost:3000";
const SMALL_N = Math.max(1, Number(process.env.BENCH_SMALL_N ?? 10));
const INCLUDE_CORRUPT = process.env.BENCH_INCLUDE_CORRUPT !== "0";
const TIMEOUT_MS = Number(process.env.BENCH_TIMEOUT_MS ?? 300_000);
const POLL_MS = Number(process.env.BENCH_POLL_MS ?? 1000);
const CLEANUP = process.env.BENCH_CLEANUP !== "0";
const USD_PER_1M = process.env.BENCH_EMBED_USD_PER_1M
  ? Number(process.env.BENCH_EMBED_USD_PER_1M)
  : undefined;

const CORRUPT_PDF = resolve(__dirname, "../tests/regression/phase-1/fixtures/corrupt.pdf");

interface Uploaded {
  expectSuccess: boolean;
  title: string;
  documentId?: string;
  jobId?: string;
  bullJobId?: string;
  t0: number;
  uploadError?: string;
}

function authHeaders(): Record<string, string> {
  const token = process.env.KB_ADMIN_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function preflight(): Promise<void> {
  const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res) {
    throw new Error(`无法连接 ${BASE}，请先 yarn dev:web（以及 docker:up + yarn dev:worker）`);
  }
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL 未设置，无法采样队列深度");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 未设置，无法轮询 ingest_jobs（避免撞 KB HTTP 限流）");
  }
  if (
    !process.env.ASTRA_DB_APPLICATION_TOKEN ||
    !process.env.ASTRA_DB_API_ENDPOINT ||
    !process.env.ASTRA_DB_COLLECTION
  ) {
    throw new Error("Astra 环境变量不完整，无法对账向量条数");
  }
}

async function makeFixtures(
  dir: string,
): Promise<{ path: string; expectSuccess: boolean; name: string }[]> {
  await fs.mkdir(dir, { recursive: true });
  const files: { path: string; expectSuccess: boolean; name: string }[] = [];

  for (let i = 0; i < SMALL_N; i++) {
    const name = `bench-ingest-${Date.now()}-${i}.md`;
    const path = join(dir, name);
    const body = [
      `# Bench doc ${i}`,
      "",
      `生成于 ${new Date().toISOString()}，用于入库指标压测。`,
      "",
      "段落重复以产生少量 chunk：",
      ...Array.from(
        { length: 8 },
        (_, k) => `段落 ${k + 1}：Personal GPT async ingest bench sample ${i}.`,
      ),
      "",
    ].join("\n");
    await fs.writeFile(path, body, "utf8");
    files.push({ path, expectSuccess: true, name });
  }

  if (INCLUDE_CORRUPT) {
    try {
      await fs.access(CORRUPT_PDF);
      files.push({
        path: CORRUPT_PDF,
        expectSuccess: false,
        name: `bench-corrupt-${Date.now()}.pdf`,
      });
    } catch {
      console.warn("[bench] 跳过损坏 PDF：fixtures 不存在", CORRUPT_PDF);
    }
  }

  return files;
}

async function uploadFile(
  filePath: string,
  title: string,
  mime: string,
): Promise<{ documentId: string; jobId: string; bullJobId: string | null }> {
  const buf = await fs.readFile(filePath);

  for (let attempt = 0; attempt < 5; attempt++) {
    const blob = new Blob([new Uint8Array(buf)], { type: mime });
    const form = new FormData();
    form.append("file", blob, title);
    form.append("title", title.replace(/\.[^.]+$/, ""));
    form.append("category", "bench-ingest");
    form.append("tags", "bench,ingest-metrics");

    const res = await fetch(`${BASE}/api/kb/documents`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    const json = (await res.json()) as {
      error?: string;
      document?: { id: string };
      job?: { id: string; bullJobId?: string | null };
      retryAfter?: number;
    };
    if (res.status === 429) {
      const waitSec = Number(json.retryAfter ?? res.headers.get("Retry-After") ?? 5);
      console.warn(`[bench] upload 429，等待 ${waitSec}s 后重试`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }
    if (!res.ok) {
      throw new Error(json.error ?? `upload HTTP ${res.status}`);
    }
    if (!json.document?.id || !json.job?.id) {
      throw new Error("upload 响应缺少 document/job id");
    }
    return {
      documentId: json.document.id,
      jobId: json.job.id,
      bullJobId: json.job.bullJobId ?? null,
    };
  }
  throw new Error("upload 连续 429，放弃");
}

/** 轮询走 PG，避免 Upstash KB 限流（30/min）把压测自己打死 */
async function readTerminalFromPg(
  pg: PgClient,
  jobId: string,
  documentId: string,
): Promise<{
  status: "ready" | "failed";
  chunkCount: number;
  progress: number;
  attemptsHint: number;
} | null> {
  const jobRes = await pg.query<{ status: string; progress: number }>(
    `SELECT status, progress FROM ingest_jobs WHERE id = $1`,
    [jobId],
  );
  const job = jobRes.rows[0];
  if (!job) return null;
  if (job.status !== "completed" && job.status !== "failed") return null;

  const docRes = await pg.query<{ status: string; chunk_count: number }>(
    `SELECT status, chunk_count FROM documents WHERE id = $1`,
    [documentId],
  );
  const row = docRes.rows[0];
  if (!row) return null;

  if (job.status === "completed" || row.status === "ready") {
    return {
      status: "ready",
      chunkCount: Number(row.chunk_count ?? 0),
      progress: Number(job.progress ?? 0),
      attemptsHint: 1,
    };
  }
  return {
    status: "failed",
    chunkCount: Number(row.chunk_count ?? 0),
    progress: Number(job.progress ?? 0),
    attemptsHint: 1,
  };
}

async function cleanupDocument(pg: PgClient, documentId: string): Promise<void> {
  try {
    await createVectorStore().deleteByDocument(DEFAULT_WORKSPACE_ID, documentId);
  } catch {
    /* ignore */
  }
  const fileRes = await pg.query<{ file_path: string | null }>(
    `SELECT file_path FROM documents WHERE id = $1`,
    [documentId],
  );
  const filePath = fileRes.rows[0]?.file_path;
  if (filePath) {
    await fs.unlink(filePath).catch(() => undefined);
  }
  await pg.query(`DELETE FROM documents WHERE id = $1`, [documentId]);
}

async function countVectors(documentId: string): Promise<number> {
  const client = new DataAPIClient(process.env.ASTRA_DB_APPLICATION_TOKEN!);
  const db = client.db(process.env.ASTRA_DB_API_ENDPOINT!, {
    token: process.env.ASTRA_DB_APPLICATION_TOKEN!,
  });
  const col = db.collection(process.env.ASTRA_DB_COLLECTION!);
  const rows = (await col
    .find(
      {
        workspaceId: { $eq: DEFAULT_WORKSPACE_ID },
        documentId: { $eq: documentId },
      },
      { limit: 2000, projection: { _id: 1, chunkIndex: 1 } },
    )
    .toArray()) as unknown[];
  return rows.length;
}

function mimeFor(name: string): string {
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".md")) return "text/markdown";
  return "text/plain";
}

async function main() {
  console.log(`[bench] base=${BASE} smallN=${SMALL_N} corrupt=${INCLUDE_CORRUPT}`);
  await preflight();

  const pg = new PgClient({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  const fixtureDir = await fs.mkdtemp(join(tmpdir(), "bench-ingest-"));
  const fixtures = await makeFixtures(fixtureDir);
  console.log(`[bench] fixtures=${fixtures.length} dir=${fixtureDir}`);

  const queue = new Queue(INGEST_QUEUE_NAME, {
    connection: { url: process.env.REDIS_URL! },
  });

  let peakWaiting = 0;
  let peakActive = 0;
  const sampler = setInterval(
    () => {
      void queue.getJobCounts("waiting", "active").then((counts) => {
        peakWaiting = Math.max(peakWaiting, counts.waiting ?? 0);
        peakActive = Math.max(peakActive, counts.active ?? 0);
      });
    },
    Math.min(500, POLL_MS),
  );

  // 突发入队：打满 concurrency=2；上传遇 429 会退避
  const uploaded: Uploaded[] = await Promise.all(
    fixtures.map(async (f) => {
      const t0 = Date.now();
      try {
        const result = await uploadFile(f.path, f.name, mimeFor(f.name));
        return {
          expectSuccess: f.expectSuccess,
          title: f.name,
          documentId: result.documentId,
          jobId: result.jobId,
          bullJobId: result.bullJobId ?? undefined,
          t0,
        };
      } catch (err) {
        return {
          expectSuccess: f.expectSuccess,
          title: f.name,
          t0,
          uploadError: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  console.log(`[bench] uploaded=${uploaded.filter((u) => u.jobId).length}/${uploaded.length}`);

  const deadline = Date.now() + TIMEOUT_MS;
  const terminal = new Map<
    string,
    { status: "ready" | "failed"; at: number; chunkCount: number; progress: number }
  >();

  while (Date.now() < deadline) {
    let pending = 0;
    for (const u of uploaded) {
      if (!u.jobId || !u.documentId) continue;
      if (terminal.has(u.jobId)) continue;
      pending += 1;
      const term = await readTerminalFromPg(pg, u.jobId, u.documentId);
      if (term) {
        terminal.set(u.jobId, {
          status: term.status,
          chunkCount: term.chunkCount,
          progress: term.progress,
          at: Date.now(),
        });
      }
    }
    if (pending === 0) break;
    process.stdout.write(
      `[bench] waiting terminal ${terminal.size}/${uploaded.filter((u) => u.jobId).length} peakWait=${peakWaiting}\r`,
    );
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  process.stdout.write("\n");

  clearInterval(sampler);

  const waitMs: number[] = [];
  for (const u of uploaded) {
    if (!u.bullJobId) continue;
    try {
      const bullJob = await queue.getJob(u.bullJobId);
      if (bullJob?.processedOn && bullJob.timestamp) {
        waitMs.push(Math.max(0, bullJob.processedOn - bullJob.timestamp));
      }
    } catch {
      /* ignore */
    }
  }

  const outcomes: DocOutcome[] = [];
  for (const u of uploaded) {
    if (u.uploadError || !u.jobId || !u.documentId) {
      outcomes.push({
        expectSuccess: u.expectSuccess,
        status: "upload_error",
      });
      continue;
    }
    const term = terminal.get(u.jobId);
    if (!term) {
      outcomes.push({
        expectSuccess: u.expectSuccess,
        status: "timeout",
        latencyMs: Date.now() - u.t0,
      });
      continue;
    }

    let attemptsMade = 1;
    if (u.bullJobId) {
      const bullJob = await queue.getJob(u.bullJobId);
      attemptsMade = bullJob?.attemptsMade ? Math.max(1, bullJob.attemptsMade) : 1;
    }

    // 失败且 progress>=75：embed 已跑过，但 document.chunk_count 仍为 0；
    // 用「至少 1 chunk × attempts」占位，避免成本项全空。
    let chunkCount = term.chunkCount;
    if (term.status === "failed" && chunkCount === 0 && term.progress >= 75) {
      chunkCount = 1;
    }

    let vectorCount: number | undefined;
    if (term.status === "ready") {
      vectorCount = await countVectors(u.documentId);
    }

    outcomes.push({
      expectSuccess: u.expectSuccess,
      status: term.status,
      latencyMs: term.at - u.t0,
      chunkCount,
      attemptsMade,
      vectorCount,
    });
  }

  const metrics = aggregateIngestMetrics(
    outcomes,
    { peakWaiting, peakActive, waitMs },
    { usdPerMillionTokens: USD_PER_1M, avgCharsPerChunk: 900 },
  );

  const at = new Date().toISOString();
  const md = formatMetricsMarkdown(metrics, {
    baseUrl: BASE,
    concurrencyHint: "2 (IngestProcessor)",
    at,
  });

  const outDir = resolve(__dirname, "bench-output");
  await fs.mkdir(outDir, { recursive: true });
  const stamp = at.replace(/[:.]/g, "-");
  const mdPath = join(outDir, `ingest-metrics-${stamp}.md`);
  const jsonPath = join(outDir, `ingest-metrics-${stamp}.json`);
  await fs.writeFile(mdPath, md, "utf8");
  await fs.writeFile(
    jsonPath,
    JSON.stringify({ meta: { baseUrl: BASE, at, smallN: SMALL_N }, metrics, outcomes }, null, 2),
    "utf8",
  );

  console.log("\n" + md);
  console.log(`[bench] wrote ${mdPath}`);
  console.log(`[bench] wrote ${jsonPath}`);

  if (CLEANUP) {
    for (const u of uploaded) {
      if (u.documentId) {
        await cleanupDocument(pg, u.documentId).catch((err) =>
          console.warn(`[bench] cleanup ${u.documentId} failed:`, err),
        );
      }
    }
    console.log("[bench] cleanup done");
  }

  await queue.close();
  await pg.end();
  await fs.rm(fixtureDir, { recursive: true, force: true }).catch(() => undefined);

  const badExpected = outcomes.some((o) => o.expectSuccess && o.status !== "ready");
  process.exit(badExpected ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
