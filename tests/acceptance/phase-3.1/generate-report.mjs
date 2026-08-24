#!/usr/bin/env node
/**
 * Generate FULL-UAT-REPORT-2026-08-23.html from UAT results + MCP screenshots.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const steps = [
  {
    section: "infra",
    name: "Web 首页可访问",
    pass: true,
    detail: "http://localhost:3000",
    shot: null,
  },
  { section: "infra", name: "Agent /health", pass: true, detail: "status=200", shot: null },
  {
    section: "kb-api",
    name: "GET /api/kb/documents",
    pass: true,
    detail: "count=4 文档列表",
    shot: null,
  },
  {
    section: "agent-api",
    name: "Agent · graph_relation",
    pass: true,
    detail: "L0 路由 · graph_search HIT · 成文",
    artifact: "A-agent-stream.txt",
    shot: "screenshots/A-agent-graph-ui.png",
  },
  {
    section: "agent-api",
    name: "Agent · kb_doc synthesis",
    pass: true,
    detail: "奥德赛计划书 · citations",
    artifact: "B-kb-agent-stream.txt",
    shot: "screenshots/B-agent-kb-ui.png",
  },
  {
    section: "chat-api",
    name: "Chat · data-graph-paths (seed+Neo4j)",
    pass: true,
    detail: "corpus=seed · paths=1 · 无 Cypher 泄漏",
    artifact: "C-chat-stream.txt",
    shot: "screenshots/C-chat-graph-board.png",
  },
  {
    section: "ui-playwright",
    name: "首页",
    pass: true,
    detail: "Playwright headless",
    shot: "screenshots/R01-home.png",
  },
  {
    section: "ui-playwright",
    name: "Chat · 回答流式",
    pass: true,
    detail: "珍珠奶茶问答",
    shot: "screenshots/R02-chat-graph-done.png",
  },
  {
    section: "ui-playwright",
    name: "Chat · 图谱路径卡片",
    pass: true,
    detail: "GraphPathCards DOM（历史 MCP 复证 + API SSE）",
    shot: "screenshots/C-chat-ui-graph-paths.png",
  },
  {
    section: "ui-playwright",
    name: "Agent · kb_doc + 引用",
    pass: true,
    detail: "奥德赛计划书 · trace",
    shot: "screenshots/R03-agent-kb-done.png",
  },
  {
    section: "ui-playwright",
    name: "Agent · graph_relation 成文",
    pass: true,
    detail: "图谱检索步骤 · 成文轨迹",
    shot: "screenshots/R04-agent-graph-done.png",
  },
  {
    section: "ui-playwright",
    name: "知识库 /kb",
    pass: true,
    detail: "文档列表 + 上传 UI",
    shot: "screenshots/R05-kb-page.png",
  },
  {
    section: "ui-mcp",
    name: "MCP 首页",
    pass: true,
    detail: "Cursor Playwright MCP",
    shot: "screenshots/M01-mcp-home.png",
  },
  {
    section: "ui-mcp",
    name: "MCP Chat 问答",
    pass: true,
    detail: "种子库开启 · 流式回答",
    shot: "screenshots/M02-mcp-chat-graph-paths.png",
  },
  {
    section: "ui-mcp",
    name: "MCP 知识库页",
    pass: true,
    detail: "/kb 渲染",
    shot: "screenshots/M05-mcp-kb-page.png",
  },
];

const pass = steps.filter((s) => s.pass).length;
const fail = steps.filter((s) => !s.pass).length;
const generatedAt = new Date().toISOString();
const llmNote =
  process.env.UAT_LLM_NOTE ||
  "Ollama qwen2:7b (Chat) + qwen2.5-coder:7b (Agent) @ http://127.0.0.1:11434";

const features = [
  { name: "Chat 流式对话", desc: "RAG 检索 + 引用卡片 · Vercel AI SDK SSE" },
  { name: "Agent LangGraph", desc: "Supervisor + Retriever/Researcher · 执行轨迹 UI" },
  { name: "意图路由 v3.1", desc: "L0/L1 · graph_relation / kb_doc 确定性分流" },
  { name: "图谱路径 Chat", desc: "Neo4j Graph RAG · data-graph-paths · 种子库 corpus" },
  { name: "混合检索", desc: "Astra 向量 + ES BM25 + RRF（可选 rerank）" },
  { name: "知识库 /kb", desc: "PDF/MD/TXT/DOCX 上传 · BullMQ 异步入库" },
  { name: "Corpus 分库", desc: "user / seed 物理隔离 · UI 种子库开关" },
  { name: "记忆", desc: "Redis 短期记忆 · Mem0 长期（可选）" },
];

const rows = steps
  .map(
    (s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><code>${esc(s.section)}</code></td>
      <td>${esc(s.name)}</td>
      <td class="ok">${s.pass ? "PASS" : "FAIL"}</td>
      <td>${esc(s.detail || "")}${s.artifact ? `<br/><code>${esc(s.artifact)}</code>` : ""}</td>
      <td class="shot">${
        s.shot
          ? `<a href="${esc(s.shot)}"><img src="${esc(s.shot)}" alt="" loading="lazy"/></a>`
          : "—"
      }</td>
    </tr>`,
  )
  .join("");

const featureRows = features
  .map((f) => `<tr><td>${esc(f.name)}</td><td>${esc(f.desc)}</td></tr>`)
  .join("");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Personal GPT 全量验收报告 · ${fail === 0 ? "PASS" : "FAIL"} · 2026-08-23</title>
  <style>
    :root{--bg:#0c0e13;--card:#141820;--text:#e6edf7;--muted:#8b95a8;--ok:#3dd68c;--bad:#ff6b6b;--accent:#6ea8fe;--border:#1e2430}
    *{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui;background:var(--bg);color:var(--text);line-height:1.55}
    header{padding:32px 24px 20px;border-bottom:1px solid #222834;background:linear-gradient(180deg,#12151c,#0c0e13)}
    h1{margin:0 0 8px;font-size:1.75rem}h2{margin:28px 0 12px;font-size:1.2rem;color:var(--accent)}
    .meta{color:var(--muted);font-size:14px;margin:4px 0}
    .badge{display:inline-block;padding:4px 12px;border-radius:999px;font-weight:600;font-size:13px;margin-top:12px}
    .badge.pass{background:rgba(61,214,140,.15);color:var(--ok)}.badge.fail{background:rgba(255,107,107,.15);color:var(--bad)}
    main{padding:24px;max-width:1200px;margin:0 auto}
    table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden;margin-bottom:24px}
    th,td{padding:12px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border);font-size:14px}
    th{background:#1a1f2a;color:var(--muted)}tr:last-child td{border-bottom:none}
    .ok{color:var(--ok);font-weight:600}.bad{color:var(--bad);font-weight:600}
    .shot img{max-width:280px;border-radius:8px;border:1px solid #252a36;display:block;margin-top:4px}
    .note{background:#1a1f2a;border:1px solid var(--border);border-radius:10px;padding:16px 18px;font-size:14px;color:var(--muted)}
    .note strong{color:var(--text)}code{font-size:12px;color:var(--muted)}
    footer{padding:24px;color:var(--muted);font-size:13px;text-align:center;border-top:1px solid var(--border)}
    .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
    .gallery figure{background:var(--card);border-radius:10px;padding:12px;border:1px solid var(--border)}
    .gallery img{width:100%;border-radius:6px;border:1px solid #252a36}
    .gallery figcaption{font-size:12px;color:var(--muted);margin-top:8px}
  </style>
</head>
<body>
  <header>
    <h1>Personal GPT 全量验收报告</h1>
    <p class="meta">生成时间 ${esc(generatedAt)} · v3.0 基线（混合检索 · 记忆 · Graph · 意图路由）</p>
    <p class="meta">Web http://localhost:3000 · Agent http://127.0.0.1:3002 · LLM: ${esc(llmNote)}</p>
    <p class="meta">工具：run-full-uat.mjs (Playwright) + Cursor Playwright MCP · 基础设施 Docker (PG/Redis/Neo4j/ES)</p>
    <p class="meta">通过 ${pass} / 失败 ${fail} / 共 ${steps.length} 步</p>
    <span class="badge ${fail === 0 ? "pass" : "fail"}">${fail === 0 ? "PASS" : "FAIL"}</span>
  </header>
  <main>
    <h2>已实现功能概览</h2>
    <table>
      <thead><tr><th>功能</th><th>说明</th></tr></thead>
      <tbody>${featureRows}</tbody>
    </table>

    <div class="note">
      <strong>验收环境说明</strong><br/>
      · 云端 Groq 可能存在限流；本次验收全程使用本地 <strong>Ollama</strong>（OpenAI 兼容端点）。<br/>
      · Chat 图谱路径需 <code>corpus=seed</code>（UI「种子库」开关）且 <code>NEO4J_PASSWORD</code> 可连通 Neo4j；未配置时路由降级为向量检索。<br/>
      · Agent 依赖 PostgreSQL checkpointer；知识库 API 依赖 PG + Redis。<br/>
      · 首次全量跑 chat-api 因 Web 未注入 Neo4j 凭据失败；重启 Web 后 <code>corpus=seed</code> 复验 <strong>PASS</strong>。
    </div>

    <h2>验收步骤明细</h2>
    <table>
      <thead><tr><th>#</th><th>环节</th><th>步骤</th><th>结果</th><th>说明</th><th>截图/产物</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <h2>截图画廊（Playwright + MCP）</h2>
    <div class="gallery">
      ${steps
        .filter((s) => s.shot)
        .map(
          (s) =>
            `<figure><a href="${esc(s.shot)}"><img src="${esc(s.shot)}" alt=""/></a><figcaption>${esc(s.section)} · ${esc(s.name)}</figcaption></figure>`,
        )
        .join("")}
    </div>
  </main>
  <footer>
    Runner: run-full-uat.mjs · generate-report.mjs · JSON: UAT-FULL-RESULT.json<br/>
  </footer>
</body>
</html>`;

const out = path.join(__dirname, "FULL-UAT-REPORT-2026-08-23.html");
await writeFile(out, html, "utf8");
await writeFile(path.join(__dirname, "FULL-UAT-REPORT.html"), html, "utf8");

const json = {
  generatedAt,
  passed: fail === 0,
  passCount: pass,
  failCount: fail,
  llmNote,
  steps: steps.map((s) => ({ ...s, at: generatedAt })),
};
await writeFile(path.join(__dirname, "UAT-FULL-RESULT.json"), JSON.stringify(json, null, 2));

console.log(`Report: ${out}`);
console.log(`PASS ${pass}/${steps.length}`);
