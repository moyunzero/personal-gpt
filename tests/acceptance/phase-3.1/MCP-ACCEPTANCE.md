# Phase 3.1 — Intent Routing 浏览器/MCP 验收（含截图）

**When:** 2026-08-22（KB synthesis 复验 18:47 UTC+8）  
**Tools:** Playwright MCP + `run-browser-uat.mjs`  
**Base:** http://localhost:3000 · agent http://127.0.0.1:3002/health

截图目录：`tests/acceptance/phase-3.1/screenshots/`  
机器可读结果：`tests/acceptance/phase-3.1/UAT-AUTO-RESULT.json`

> Playwright headless + Turbopack dev 下 composer 点击/发送仍可能未水合（与 Phase 3 一致）。  
> **功能验收**使用同源 API SSE 旁路；**UI 壳**保留真实页面截图。

## Test 1 — Agent trace / graph_search（H-04 / D-15）

| Step | Action                          | Screenshot                                                       | Result      |
| ---- | ------------------------------- | ---------------------------------------------------------------- | ----------- |
| U01  | 打开首页                        | [U01-home.png](./screenshots/U01-home.png)                       | PASS        |
| U02  | 切 Agent（MCP）                 | [U02-agent-mode.png](./screenshots/U02-agent-mode.png)           | PASS        |
| M02  | MCP 点 Agent                    | [M02-mcp-agent-mode.png](./screenshots/M02-mcp-agent-mode.png)   | WARN — 同上 |
| API  | `POST /api/agent/chat` 珍珠奶茶 | [A-agent-stream.txt](./A-agent-stream.txt)                       | **PASS**    |
| 旁证 | IntentPlan + trace 证据板       | [A-agent-trace-board.png](./screenshots/A-agent-trace-board.png) | **PASS**    |

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

**API 断言（PASS）：**

- SSE 含 `data-graph-paths` · `Product:珍珠奶茶 → …`
- payload **无** cypher 字段 · DOM 侧不暴露 raw Cypher

## Test 3 — Agent kb_doc synthesis（D-11 / KB 合成修复）

| Step | Action                              | Artifact                                                             | Result   |
| ---- | ----------------------------------- | -------------------------------------------------------------------- | -------- |
| API  | `POST /api/agent/chat` 奥德赛计划书 | [B-kb-agent-stream.txt](./B-kb-agent-stream.txt)                     | **PASS** |
| 旁证 | synthesis 证据板                    | [B-kb-synthesis-board.html](./screenshots/B-kb-synthesis-board.html) | **PASS** |

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

## 总评

| 类别                                   | 结论                                             |
| -------------------------------------- | ------------------------------------------------ |
| Agent kb_doc synthesis + citation 一致 | **PASS**（Test 3）                               |
| Agent intent routing + graph HIT       | **PASS**（Test 1）                               |
| Chat graph path SSE                    | **PASS**（Test 2）                               |
| Browser composer Send                  | **WARN** — Turbopack 水合（Send disabled）       |
| Phase 3.1 UAT overall                  | **PASS**（API + UI MCP，`UAT-AUTO-RESULT.json`） |

## Test 4 — Cursor Browser MCP UI（DOM 端到端）

详见 [UI-MCP-RESULT.md](./UI-MCP-RESULT.md)

| UI Case                         | Screenshot                                                           | Result   |
| ------------------------------- | -------------------------------------------------------------------- | -------- |
| Chat 图谱路径卡片               | [C-chat-ui-graph-paths.png](./screenshots/C-chat-ui-graph-paths.png) | **PASS** |
| Agent kb_doc + Citation + Trace | [B-agent-kb-ui.png](./screenshots/B-agent-kb-ui.png)                 | **PASS** |
| Agent graph_relation + 步骤中文 | [A-agent-graph-ui.png](./screenshots/A-agent-graph-ui.png)           | **PASS** |

> Send：空输入 disabled；**输入文字后可点** — MCP 完整走通发送链路。
