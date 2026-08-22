# KB 合成层修复 — 浏览器/API 验收

**Date:** 2026-08-22  
**Runner:** `node tests/acceptance/phase-3.1/run-browser-uat.mjs`  
**Result:** `UAT-AUTO-RESULT.json` → `passed: true`

## Test B — kb_doc synthesis（D-11）

| Check                                                | Result                         |
| ---------------------------------------------------- | ------------------------------ |
| `route=single_specialist` · `primary=kb_doc`         | ✅                             |
| prefetch HIT · `data-citations` 非空                 | ✅（`奥德赛计划书_全量验收2`） |
| 无 `> 说明：知识库未找到…` 脚注（single_specialist） | ✅                             |
| 正文含实质摘要（非纯 miss）                          | ✅                             |
| citation + 正文一致                                  | ✅                             |

**Query:** `奥德赛计划书的主要内容是什么？`  
（本地库无「红烧肉」HIT；相似度 0.593 < 0.60，故改用已入库文档验收 synthesis 路径。）

**Evidence:** `B-kb-agent-stream.txt` · `screenshots/B-kb-synthesis-board.html`

## Regression

| Test                                         | Result |
| -------------------------------------------- | ------ |
| A — Agent graph HIT + 无 KB miss 脚注        | ✅     |
| C — Chat `data-graph-paths` + 无 cypher 泄漏 | ✅     |

## UI 壳（Playwright MCP）

| Screenshot           | Note                                     |
| -------------------- | ---------------------------------------- |
| `U01-home.png`       | 首页                                     |
| `U02-agent-mode.png` | Agent 模式已切换                         |
| Send 仍 disabled     | WARN — Turbopack 水合（与 Phase 3 一致） |
