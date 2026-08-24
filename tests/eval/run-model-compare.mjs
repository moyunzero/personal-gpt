#!/usr/bin/env node
/**
 * 多模型 API 对比：仅测 LLM 依赖的 3 条 SSE 路径（graph / kb_doc / chat paths）
 * 用法：WEB_BASE=http://localhost:3000 node tests/eval/run-model-compare.mjs
 */
const WEB_BASE = process.env.WEB_BASE || "http://localhost:3000";
const TIMEOUT_MS = Number(process.env.MODEL_COMPARE_TIMEOUT_MS || 300_000);

const CASES = [
  {
    id: "agent-graph",
    label: "Agent · graph_relation",
    url: `${WEB_BASE}/api/agent/chat`,
    body: {
      messages: [
        {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "珍珠奶茶有哪些原料，用了什么工艺？" }],
        },
      ],
      thread_id: `cmp-graph-${Date.now()}`,
    },
    pass: (raw) => /graph_relation|graph_search|GRAPH_SEARCH_STATUS/i.test(raw) && raw.length > 500,
  },
  {
    id: "agent-kb",
    label: "Agent · kb_doc synthesis",
    url: `${WEB_BASE}/api/agent/chat`,
    body: {
      messages: [
        {
          id: "u2",
          role: "user",
          parts: [{ type: "text", text: "奥德赛计划书的主要内容是什么？" }],
        },
      ],
      thread_id: `cmp-kb-${Date.now()}`,
    },
    pass: (raw) => /kb_doc|奥德赛|data-citations/i.test(raw),
  },
  {
    id: "chat-paths",
    label: "Chat · data-graph-paths",
    url: `${WEB_BASE}/api/chat`,
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
    pass: (raw) => (raw.match(/data-graph-paths/g) || []).length > 0 && !/MATCH\s*\(/i.test(raw),
  },
];

async function runCase(c) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(c.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: WEB_BASE, Referer: `${WEB_BASE}/` },
      body: JSON.stringify(c.body),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    const ms = Date.now() - start;
    const ok = res.ok && c.pass(raw);
    return {
      ...c,
      ok,
      ms,
      status: res.status,
      bytes: raw.length,
      err: ok ? null : `status=${res.status}`,
    };
  } catch (e) {
    return { ...c, ok: false, ms: Date.now() - start, status: 0, bytes: 0, err: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const stack = process.argv[2] || process.env.MODEL_STACK || "unknown";
  console.log(`\n=== Model compare: ${stack} ===`);
  const results = [];
  for (const c of CASES) {
    process.stdout.write(`  ${c.label} ... `);
    const r = await runCase(c);
    results.push(r);
    console.log(r.ok ? `PASS (${(r.ms / 1000).toFixed(1)}s)` : `FAIL — ${r.err}`);
  }
  const pass = results.filter((r) => r.ok).length;
  console.log(`  → ${pass}/${results.length} passed\n`);
  return { stack, pass, total: results.length, results };
}

main().then((out) => {
  import("node:fs/promises").then((fs) => {
    const path = new URL("./MODEL-COMPARE-RESULT.json", import.meta.url);
    return fs.writeFile(
      path,
      JSON.stringify({ generatedAt: new Date().toISOString(), ...out }, null, 2),
    );
  });
});
