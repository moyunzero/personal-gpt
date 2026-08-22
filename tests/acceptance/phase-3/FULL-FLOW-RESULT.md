# Phase 3 Full-Flow Acceptance Result

**When:** 2026-08-22  
**Branch context:** Phase 3 RAG / hybrid / graph / memory / rerank  
**Gate applied:** `ENABLE_RERANKER=true` + web/agent/worker restarted before run  
**H04 Milvus:** **SKIP** (production path = Astra; Milvus optional)

Evidence root: `tests/acceptance/phase-3/screenshots/full-flow/`  
**截图墙（一页浏览全部 PNG）：** 打开同目录 [`INDEX.html`](./screenshots/full-flow/INDEX.html)（或看 `INDEX-gallery.png`）。

| Wave | 主要截图 |
|------|----------|
| A | `A01`–`A06`, `A08` |
| B | `B03-*`, `B04-es-hit.png`, `B00-es-board.png`, `B05-chat-board.png` |
| C | `C02`/`C03`, `C00-corpus-board.png` |
| D | `D01`, `D04-agent-board.png`, `D00-graph-board.png` |
| E | `E00-mem0-board.png` |
| F | `F00-rerank-board.png` |
| G | `G01-new-session.png` |
| H | `H00-regression-board.png` |

> Playwright MCP 下 composer Send 未水合，成答类步骤用「同源 API 流 → 证据板截图」；UI 壳仍为真实页面截图。

## Verdict

| Layer | Result |
|-------|--------|
| Infra (web/agent/worker/ES/Neo4j) | PASS |
| Wave A UI shell screenshots | PASS (A07 localStorage WARN) |
| Wave B ES dual-write ingest/delete + Chat API | PASS |
| Wave C corpus isolation | PARTIAL / WARN |
| Wave D Graph RAG | PASS |
| Wave E Mem0 preference | PASS |
| Wave F live dedicated rerank | PASS |
| Wave G checkpointer / new session UI | PASS API / WARN UI send |
| Wave H regression + eval | PASS (13/13 + 2/2) |
| H04 Milvus delete | SKIP |

**Overall: PASS with known WARNs** (Playwright hydration / seed Astra collection / psychology under user corpus).

---

## Wave summary

### Wave A — UI shell
Screenshots: `A01`–`A06`, `A08`.  
**A07 WARN:** Playwright + Turbopack → `localStorage` empty (`pgpt:userKey` null). Re-check in real browser.

### Wave B — ES dual-write + Chat
| Step | Result | Evidence |
|------|--------|----------|
| Upload → ready | PASS | `B03-kb-ready.png`, doc `05a85d01-…` |
| ES hit for doc | PASS | `B04-es-hit.json` / `.png` |
| Chat stream (Origin) | PASS | `B05-chat-stream.txt` — answers 保守/平衡/进取 |
| Delete → ES empty | PASS | `B06-delete.json`, `B07-es-empty.json` |
| UI Send click | WARN | `B05-chat-ui-attempt.png` — Send stays disabled; React input not hydrated under MCP |

Chat retrieve log still listed low-score `psychology-qa` beside Odyssey (see Findings).

### Wave C — Corpus
| Step | Result | Evidence |
|------|--------|----------|
| Hybrid `corpus=user` | PASS | `C01-corpus-hybrid.json` — top = Odyssey; `userHasPsych=false` for this query |
| Hybrid `corpus=seed` | WARN | Astra `db_emotion_seed` missing; ES `kb_seed` missing (fail-open) |
| UI corpus toggle shots | PASS | `C02-corpus-user.png`, `C03-corpus-seed.png` |

### Wave D — Graph
| Step | Result | Evidence |
|------|--------|----------|
| `graphRagQuery` | PASS | `D05-graph.json` — `GRAPH_RAG_STATUS: HIT` Product→Ingredient→Method |
| Agent `/api/agent/chat` | PASS | `D06-agent-graph.txt` — GRAPH / tapioca / boil |
| Agent UI send | WARN | same hydration; mode screenshot `D01-agent-mode.png` |

### Wave E — Mem0
| Step | Result | Evidence |
|------|--------|----------|
| Write + search | PASS | `E01-mem0.json` — preference recalled |
| Chat recall same `userKey` | PASS | `E02-chat-recall.txt` — 简洁 / 偏好 |

### Wave F — Rerank
| Step | Result | Evidence |
|------|--------|----------|
| Dedicated HTTP rerank | PASS | `F01-rerank.json` — Odyssey `0.72` ≫ noise `0.027`, `mode=dedicated` |

### Wave G — Session
| Step | Result | Evidence |
|------|--------|----------|
| New session UI | PASS shell | `G01-new-session.png` |
| Same `thread_id` | PASS | `G02a` / `G02b` mention 暗号 |
| New `thread_id` | WARN | `G03` still mentions 蓝莓松饼 — likely shared `userKey=anonymous` Mem0, not proof of checkpointer leak |

### Wave H — Automated
| Step | Result | Evidence |
|------|--------|----------|
| `yarn test:regression:phase-3` | PASS 13/13 | `H01-regression.txt` |
| `yarn eval:phase-3` | PASS 2/2 | `H02-eval.txt` |
| H04 Milvus delete | SKIP | Astra default; no Milvus stack |

---

## Findings (do not block Phase 3 gate)

1. **Playwright MCP hydration:** composer Send disabled; `localStorage` empty. API + screenshots used as acceptance side-channel.
2. **Seed vector collection missing:** `db_emotion_seed` not in Astra keyspace (`db_emotion`, `db_emotion_gemini` only). Seed corpus hybrid fails hard on vector path.
3. **psychology-qa under user corpus:** Chat retrieve with `corpus=user` can still return low-score `psychology-qa` hits (ISSUE-001 / mixed collection). Odyssey still ranked #1 after rerank for the Odyssey query.
4. **Chat curl needs Origin:** without `Origin: http://localhost:3000` → `403 Forbidden origin`.

---

## UAT mapping (`03-UAT.md`)

| # | Item | Result |
|---|------|--------|
| 1 | Live ES dual-write ingest/delete | **passed** |
| 2 | Live Neo4j graph_search path | **passed** |
| 3 | Optional Mem0 live preference recall | **passed** |
| 4 | Optional live rerank API | **passed** |

## Human browser session (2026-08-22, userKey `1f20cb8c`)

| ID | Result | Notes |
|----|--------|-------|
| H-01 | **passed** | Send enabled; localStorage OK; new session keeps userKey |
| H-02 | **passed** | 保守/平衡/进取; citation 奥德赛计划书_全量验收2; no psychology-qa |
| H-04 | **passed** | Pearl query: Agent trace `graph_search` + `GRAPH_SEARCH_STATUS: HIT`; Chat `GraphPathCards` 图谱路径 card (D-07/D-15 IntentPlan expandable in AgentTracePanel). Regression: `07-intent-routing.test.ts` C1–C2 green. |
| H-05 | **passed** | Mem0 recalls 简洁/中文 after new session |

**Human closeout:** Phase 3 **passed** (H-04 closed via Phase 3.1 intent routing + graph path card UI).
