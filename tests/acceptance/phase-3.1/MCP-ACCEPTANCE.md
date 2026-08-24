# Phase 3.1 — Intent Routing 浏览器/MCP 验收（含截图）

**When:** 2026-08-23（全量 Ollama UAT 12:08–12:20 UTC+8 · MCP 复验 12:24–12:30）  
**Tools:** Playwright MCP + `run-browser-uat.mjs` + `run-full-uat.mjs`  
**Base:** http://localhost:3000 · agent http://127.0.0.1:3002/health

截图目录：`tests/acceptance/phase-3.1/screenshots/`  
机器可读结果：`tests/acceptance/phase-3.1/UAT-FULL-RESULT.json`（全量跑）· `UAT-AUTO-RESULT.json`（API 旁路）

> **历史（Turbopack + headless）：** 早期 Playwright 会话中 composer Send 在**空输入**时为 disabled，且部分点击未水合。  
> **当前结论：** 输入文字后 Send **可点**，MCP 已完整走通发送链路（见 [UI-MCP-RESULT.md](./UI-MCP-RESULT.md) 与 `R02`–`R04` 截图）。功能验收仍保留同源 API SSE 旁路作为回归证据。

## Test 1 — Agent trace / graph_search（H-04 / D-15）

| Step | Action                          | Screenshot                                                       | Result   |
| ---- | ------------------------------- | ---------------------------------------------------------------- | -------- |
| U01  | 打开首页                        | [U01-home.png](./screenshots/U01-home.png)                       | PASS     |
| U02  | 切 Agent（MCP）                 | [U02-agent-mode.png](./screenshots/U02-agent-mode.png)           | PASS     |
| M02  | MCP 点 Agent                    | [M02-mcp-agent-mode.png](./screenshots/M02-mcp-agent-mode.png)   | PASS     |
| API  | `POST /api/agent/chat` 珍珠奶茶 | [A-agent-stream.txt](./A-agent-stream.txt)                       | **PASS** |
| 旁证 | IntentPlan + trace 证据板       | [A-agent-trace-board.png](./screenshots/A-agent-trace-board.png) | **PASS** |
| UI   | DOM graph_relation + trace      | [A-agent-graph-ui.png](./screenshots/A-agent-graph-ui.png)       | **PASS** |

**API 断言（PASS）：**

- `data-agent-trace` · `route=single_specialist` · `primary=graph_relation`
- `retrieverTools=["graph_search"]` · `routerLayers=["L0"]`
- trace 含「图谱检索」/ `graph_search` · `GRAPH_SEARCH_STATUS: HIT`
- D-11：`step-prefetch` 服务端预检索（无 UI tool-input 事件属预期）

## Test 2 — Chat 图谱路径卡片（D-07）

| Step | Action                    | Screenshot                                                           | Result       |
| ---- | ------------------------- | -------------------------------------------------------------------- | ------------ |
| U04  | Chat 模式壳               | [U04-chat-mode-attempt.png](./screenshots/U04-chat-mode-attempt.png) | PASS（静态） |
| API  | `POST /api/chat` 珍珠奶茶 | [C-chat-stream.txt](./C-chat-stream.txt)                             | **PASS**     |
| 旁证 | data-graph-paths 证据板   | [C-chat-graph-board.png](./screenshots/C-chat-graph-board.png)       | **PASS**     |
| UI   | GraphPathCards DOM        | [C-chat-ui-graph-paths.png](./screenshots/C-chat-ui-graph-paths.png) | **PASS**     |

**API 断言（PASS）：**

- SSE 含 `data-graph-paths` · `Product:珍珠奶茶 → …`
- payload **无** cypher 字段 · DOM 侧不暴露 raw Cypher

## Test 3 — Agent kb_doc synthesis（D-11 / KB 合成修复）

| Step | Action                              | Artifact                                                             | Result   |
| ---- | ----------------------------------- | -------------------------------------------------------------------- | -------- |
| API  | `POST /api/agent/chat` 奥德赛计划书 | [B-kb-agent-stream.txt](./B-kb-agent-stream.txt)                     | **PASS** |
| 旁证 | synthesis 证据板                    | [B-kb-synthesis-board.html](./screenshots/B-kb-synthesis-board.html) | **PASS** |
| UI   | Citation + Trace DOM                | [B-agent-kb-ui.png](./screenshots/B-agent-kb-ui.png)                 | **PASS** |

**API 断言（PASS）：**

- `route=single_specialist` · `primary=kb_doc`
- `data-citations` 含 `奥德赛计划书_全量验收2`
- 无 `> 说明：知识库未找到…` 脚注（single_specialist 单一 miss 出口）
- 正文含实质摘要（citation fallback / LLM 复述）

> 注：本地库「红烧肉」相似度 0.593 < 门槛 0.60，为真实 NO_HIT；合成路径改用已入库文档验收。详见 [KB-SYNTHESIS-RESULT.md](./KB-SYNTHESIS-RESULT.md)。

## UAT 修复项（验收中发现）

| Issue                                                              | Fix                                                             |
| ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `/api/chat` 500 — `graphPathsToDisplay` 从 `"use client"` 组件导入 | 提取至 `apps/web/lib/chat/graph-path-display.ts`（server-safe） |

## Test 4 — Cursor Browser MCP UI（DOM 端到端）

详见 [UI-MCP-RESULT.md](./UI-MCP-RESULT.md) · Run ID: **2026-08-22T19:05–19:09+08:00**

| UI Case                         | Screenshot                                                           | Result   |
| ------------------------------- | -------------------------------------------------------------------- | -------- |
| Chat 图谱路径卡片               | [C-chat-ui-graph-paths.png](./screenshots/C-chat-ui-graph-paths.png) | **PASS** |
| Agent kb_doc + Citation + Trace | [B-agent-kb-ui.png](./screenshots/B-agent-kb-ui.png)                 | **PASS** |
| Agent graph_relation + 步骤中文 | [A-agent-graph-ui.png](./screenshots/A-agent-graph-ui.png)           | **PASS** |
| Send（输入后发送）              | `R02`–`R04` · UI-MCP-RESULT                                          | **PASS** |

## Test 5 — 全量 Ollama UAT（API + Playwright UI）

**Report:** [FULL-UAT-REPORT.html](./FULL-UAT-REPORT.html) · [FULL-UAT-REPORT-2026-08-23.html](./FULL-UAT-REPORT-2026-08-23.html) · **15/15 PASS** · 2026-08-23

| 环节      | 步骤概要                          | 产物                |
| --------- | --------------------------------- | ------------------- |
| infra     | Web + Agent health                | —                   |
| kb-api    | GET `/api/kb/documents`           | —                   |
| agent-api | graph_relation + kb_doc synthesis | `A/B-*-stream.txt`  |
| chat-api  | `data-graph-paths` (seed+Neo4j)   | `C-chat-stream.txt` |
| ui        | 首页 / Chat / Agent / KB 页       | `R01`–`R05.png`     |
| ui-mcp    | Cursor Playwright MCP             | `M01`/`M02`/`M05`   |

> **2026-08-23 复验：** chat-api 首次失败因 Web 进程未注入 `NEO4J_PASSWORD`；重启 Web + `corpus=seed` 后 PASS。全程 Ollama 避免 Groq 限流。

## 总评

| 类别                                   | 结论                                                 |
| -------------------------------------- | ---------------------------------------------------- |
| Agent kb_doc synthesis + citation 一致 | **PASS**（Test 3）                                   |
| Agent intent routing + graph HIT       | **PASS**（Test 1）                                   |
| Chat graph path SSE + UI cards         | **PASS**（Test 2）                                   |
| Browser composer Send                  | **PASS**（输入文字后可发送；空输入 disabled 为预期） |
| Cursor Browser MCP UI（Test 4）        | **PASS**                                             |
| 全量 Ollama UAT（Test 5）              | **PASS**（15/15）                                    |
| Phase 3.1 UAT overall                  | **PASS**（API + UI Playwright + MCP + HTML 报告）    |
