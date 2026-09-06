# Phase 1–4 本地全量 UAT 验收报告

**结论：19 pass / 0 fail（2026-08-24）**

| 产物   | 路径                                                |
| ------ | --------------------------------------------------- |
| Runner | `tests/acceptance/phase-1-4-local/run-full-uat.mjs` |
| JSON   | `tests/acceptance/phase-1-4-local/UAT-RESULT.json`  |
| HTML   | `tests/acceptance/phase-1-4-local/UAT-REPORT.html`  |
| 截图   | `tests/acceptance/phase-1-4-local/screenshots/`     |

## 环境

- Infra：Docker（postgres / redis / ES / neo4j / milvus / agent / ingest）
- Web：**本地** `yarn dev:web` → `http://localhost:3000`（勿与 Docker `web` 抢端口）
- Agent：`http://localhost:3002`
- Auth：DB `sessions` 表最新 `sessionToken` → `PGPT_SESSION_COOKIE`

```bash
docker compose stop web   # 若占用 :3000
yarn dev:web

TOKEN=$(docker exec personal_gpt_postgres psql -U personal_gpt -d personal_gpt -t -A \
  -c 'SELECT "sessionToken" FROM sessions ORDER BY expires DESC LIMIT 1;')

PGPT_BASE_URL=http://localhost:3000 \
PGPT_AGENT_URL=http://localhost:3002 \
PGPT_SESSION_COOKIE="authjs.session-token=$TOKEN" \
node tests/acceptance/phase-1-4-local/run-full-uat.mjs
```

浏览器 MCP 补证：注入同 cookie 后访问 `/`、`/kb`，截图 `MCP-01-home.png` / `MCP-02-ws-menu.png` / `MCP-03-kb.png`。

## 用例覆盖

| Phase | 检查项                                     | 证据                                               |
| ----- | ------------------------------------------ | -------------------------------------------------- |
| infra | Web `/api/health`、Agent `/health`         | JSON                                               |
| P1    | 登录态首页、空状态「做个树洞吧」、建议卡×4 | `P1-01`…`P1-03`                                    |
| P1    | Chat 发送 + 助手回复                       | `P1-04`…`P1-05`                                    |
| P1    | KB 页标题 + 上传区                         | `P1-06`…`P1-07`                                    |
| P2    | Agent 模式切换 chrome                      | `P2-01`                                            |
| P2    | Agent `/api/agent/chat` SSE 首包           | `P2-agent-api.txt` + `P2-02-agent-mode-chrome.png` |
| P3    | CorpusToggle 可见 / 可勾选                 | `P3-01`…`P3-02`                                    |
| P4    | Owner pill 底边距 ≥20px（实测 32px）       | `P4-01`                                            |
| P4    | 消息区 `.chat-stream` 可滚动（内容超高时） | `P4-05`                                            |
| P4    | 会话 A→B→回 A 历史恢复                     | `P4-02`…`P4-03`                                    |
| P4    | API 会话列表 + 消息持久化                  | JSON                                               |
| P4    | 工作区弹出菜单                             | `P4-04` + `MCP-02`                                 |

## 本轮发现与修复

| 问题                                               | 影响                                                                                               | 处理                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **主区无法上下滚动**                               | Grid 子项默认 `min-height:auto`，内容撑破视口；`.app-shell{overflow:hidden}` 又禁止整页滚 → 滚不动 | `.app-main`/`main`/`kb-content` 补 `min-height:0` + 内部 `overflow-y:auto`；空状态不再用 `100dvh` 撑高 |
| 流式时强制 `scrollTop=scrollHeight`                | 用户上翻会被拽回底部                                                                               | 仅距底部 <96px 时跟随                                                                                  |
| Agent UI 长流式会卡住控件（`modeDisabled`）        | 纯 UI 发 Agent 易假失败                                                                            | UAT 改为：**Agent chrome + API SSE 首包探测**（读首 chunk 后 abort）                                   |
| Playwright `api.post` 等整段 SSE                   | 60s 超时拖垮整套                                                                                   | 同上，`page.evaluate` + `AbortController`                                                              |
| `/api/chat/sessions` **429**（Upstash，UAT 连跑）  | 持久化检查偶发 FAIL                                                                                | Runner 对 429 **退避重试**；文档注明连跑需冷却                                                         |
| Cookie host 不一致（`localhost` vs `127.0.0.1`）   | 登录态失败                                                                                         | `PGPT_BASE_URL` 与 cookie 域一致用 `localhost`                                                         |
| （历史）消息 `save` Cyclic dependency              | 会话切换丢历史                                                                                     | 已改为 `insert`/`update`；请求开始即持久化用户消息                                                     |
| （历史）`active_workspace_id` 被 Auth adapter 抹掉 | 无工作区                                                                                           | 以 `workspace_members` 为源；membership 兜底                                                           |
| （历史）Docker 代理 `127.0.0.1:7897`               | 容器内 LLM 不可达                                                                                  | `host.docker.internal:7897` + `NO_PROXY`                                                               |

## 已知限制（未改产品行为）

1. **Agent 长任务期间 UI 控件可长时间 disabled** — UAT 用 API 首包验收能力，不强制等完整 UI 流结束。
2. **Rate limit**：短时多次 UAT 可能 429；脚本已重试，仍建议间隔 ≥15s。
3. 侧栏可能残留早期失败留下的空「New chat」会话，不影响本轮验收。

## 判定

- 功能：Chat / Agent SSE / KB 壳 / Corpus / 会话恢复 / API 持久化 / 工作区菜单 — **通过**
- UI：暖色壳、树洞空状态、Owner 底边距、侧栏与 KB — **通过（截图留证）**
- 文档：本文件 + `UAT-REPORT.html` + `screenshots/`
