# Phase 3.1 Agent UX Fix — Verification

**Date:** 2026-08-22  
**Query:** 珍珠奶茶有哪些原料，用了什么工艺？

## Fixes applied

1. `graphSearchHit` tracker — suppress KB miss footnote when graph HIT
2. Strip/drop leaked tool-call JSON (`graph_search` / `kb_search`)
3. Graph-only Retriever prompt + step labels (`图谱检索 · graph_search · 图谱路径检索`)
4. Graph answer fallback when LLM produces no substantive Chinese text

## Unit tests

- `sanitize-user-text.test.ts` — tool JSON strip ✅
- `graph-answer-format.test.ts` — fallback formatter ✅
- `agent.stream.test.ts` — graph HIT no KB miss ✅

## Browser MCP + Playwright

| Check                                                   | Result |
| ------------------------------------------------------- | ------ |
| route = `single_specialist`                             | ✅     |
| `GRAPH_SEARCH_STATUS: HIT`                              | ✅     |
| No「知识库未找到足够依据」footnote                      | ✅     |
| No raw `{"name":"graph_search"...}` leak                | ✅     |
| Answer mentions 珍珠/奶茶/煮制                          | ✅     |
| Retriever step = 图谱检索 · graph_search · 图谱路径检索 | ✅     |

Screenshots: `tests/acceptance/phase-3.1/screenshots/B02-agent-mode.png`, `B05-agent-api-done.png`

**Note:** Turbopack dev + headless Playwright — Send button stays disabled (hydration). Functional verification uses in-page `/api/agent/chat` SSE (same pattern as Phase 3 full-flow).
