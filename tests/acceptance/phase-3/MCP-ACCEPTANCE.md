# Phase 3 — Playwright MCP 步进验收（含截图）

**When:** 2026-08-22  
**Tool:** Cursor `user-playwright` MCP  
**Base:** http://127.0.0.1:3000 · agent http://127.0.0.1:3002/health

截图目录：`tests/acceptance/phase-3/screenshots/mcp-steps/`

| Step | Action                 | Screenshot                                                                             | Result                                                                 |
| ---- | ---------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 01   | 打开首页               | [01-home.png](./screenshots/mcp-steps/01-home.png)                                     | PASS — 标题 / Chat·Agent / 种子库可见                                  |
| 02   | 勾选「检索种子知识库」 | [02-corpus-seed-on.png](./screenshots/mcp-steps/02-corpus-seed-on.png)                 | PASS — CorpusToggle 可点                                               |
| 03   | 切到 Agent 模式        | [03-agent-mode.png](./screenshots/mcp-steps/03-agent-mode.png)                         | PASS — Agent pressed                                                   |
| 04   | 点「新会话」           | [04-new-session.png](./screenshots/mcp-steps/04-new-session.png)                       | PASS — UI 仍稳定                                                       |
| 05   | 进入 `/kb`             | [05-kb-page.png](./screenshots/mcp-steps/05-kb-page.png)                               | PASS — 上传区 / 筛选 / 空列表                                          |
| 06   | `setInputFiles` 选 md  | [06-kb-file-selected.png](./screenshots/mcp-steps/06-kb-file-selected.png)             | PARTIAL — input 有文件，React「确认上传」仍 disabled（客户端水合异常） |
| 07   | 首页输入 UAT 探测句    | [07-chat-typed.png](./screenshots/mcp-steps/07-chat-typed.png)                         | PASS — 文本框可见内容；发送仍 disabled（state 未同步）                 |
| 08   | 点推荐问题             | [08-after-suggestion-click.png](./screenshots/mcp-steps/08-after-suggestion-click.png) | FAIL — 未发起对话流（onClick 未生效）                                  |
| 09   | Agent `/health`        | [09-agent-health.png](./screenshots/mcp-steps/09-agent-health.png)                     | PASS — 服务可达                                                        |
| 10   | ES `:9200`             | [10-es-refused.png](./screenshots/mcp-steps/10-es-refused.png)                         | FAIL — `ERR_CONNECTION_REFUSED`（镜像未起）                            |

## 额外探针

- `localStorage`：`pgpt:userKey` / `pgpt.thread.*` → **全部 null**（与 Turbopack+自动化浏览器下水合问题一致）
- Neo4j / ES live dual-write / Graph：基础设施未就绪，**未做**

## 总评

| 类别                                             | 结论                       |
| ------------------------------------------------ | -------------------------- |
| MCP + 逐步截图                                   | **完成**（10 步）          |
| UI 静态/导航冒烟                                 | **基本通过**               |
| 需客户端水合的交互（上传确认、发消息、推荐问题） | **受阻**                   |
| Live ES dual-write（UAT #1）                     | **Blocked** — ES 未运行    |
| Live Neo4j graph（UAT #2）                       | **Blocked** — Neo4j 未运行 |

下一步：修好 Docker Hub / `docker compose up -d elasticsearch neo4j`，并用**真浏览器**或 `next start`（非 Turbopack）复跑上传+对话流。

## 与 Phase 3.1 对齐（2026-08-22 后续）

Phase 3.1 MCP UI 验收已确认 **Send 在输入文字后可点**、图谱路径卡片与 Agent trace DOM 端到端通过：

- [../phase-3.1/UI-MCP-RESULT.md](../phase-3.1/UI-MCP-RESULT.md) — Run `2026-08-22T19:05–19:09+08:00`
- [../phase-3.1/MCP-ACCEPTANCE.md](../phase-3.1/MCP-ACCEPTANCE.md) — 总评 **PASS**
- [../phase-3.1/FULL-UAT-REPORT.html](../phase-3.1/FULL-UAT-REPORT.html) — 全量 11/11（Ollama）

本文件 step 07–08 的「Send disabled / 推荐问题未生效」保留为 **Turbopack+headless 历史记录**；H-04 graph 与 Chat graph cards 以 Phase 3.1 证据为准。
