---
phase: 03-rag
verified: 2026-08-21T17:01:10Z
status: human_needed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps: []
behavior_unverified_items: []
human_verification:
  - test: "docker compose up -d elasticsearch && upload a KB doc; confirm ES index receives chunks and Astra/Milvus dual-write succeeds"
    expected: "Ingest job completes; ES has matching docs for corpus index; delete removes both vector + ES"
    why_human: "Needs live ES container; unit tests mock ES fail-closed but cannot prove compose health or production dual-write"
  - test: "With Neo4j up and milk-tea subgraph seeded, ask an entity-relation question via Agent graph_search"
    expected: "Tool returns GRAPH_RAG_STATUS: HIT with Product→Ingredient→Method path nodes/rels"
    why_human: "Regression #06 uses in-memory fixture executor; live bolt session + seed not exercised in CI"
  - test: "Optional: Mem0 live key — session A stores preference, session B recalls without mock"
    expected: "Preference appears in memory block across sessions for same workspaceId:userKey"
    why_human: "CI uses mock Mem0 (allowed by plan); live SaaS path needs credentials"
  - test: "Optional: ENABLE_RERANKER with real Cross-Encoder/rerank API on a proper-noun query"
    expected: "User doc ranks above vector-only noise; ENABLE_RERANKER=false disables"
    why_human: "Rerank default-on is unit-tested; live provider quota/network not in CI"
---

# Phase 3: 记忆、存储与高级 RAG — Verification Report

**Phase Goal:** 跨会话记忆、多存储后端、Agentic RAG 与 Graph RAG；全并集关账（质量→记忆→多存储→Graph，约 5–8 周）。  
**Verified:** 2026-08-21T17:01:10Z  
**Status:** human_needed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Roadmap Success Criteria (contract). Plan-level must_haves mapped under each SC.

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | 会话 A 声明偏好后，会话 B 可召回该偏好（Redis + Mem0） | ✓ VERIFIED | `tests/regression/phase-3/03-memory-recall.test.ts` green (2/2); `ShortTermRedisMemory` + `createScopedMem0Client`; Chat `memory-context` + Agent `loadMemoryContextBlock` wired with `workspaceId`/`userKey` |
| 2 | 多跳问题触发 Agent 多轮 `kb_search` + 管道内 Corrective 并给出正确答案 | ✓ VERIFIED | `kb-search.tool.test.ts` asserts ≥2 `hybridSearch` calls (RAG-05); `maybeCorrective` max-1 rewrite via `skipCorrective` (`corrective.ts` + unit tests green); Corrective inside `hybridSearch` pipeline (D-32) |
| 3 | 混合检索（向量 + ES BM25 + app-layer RRF）+ 默认 Rerank 提升专有名词文档排名 | ✓ VERIFIED | `hybrid-search.ts` parallel vector∥ES → `reciprocalRankFusion` → `ENABLE_RERANKER !== "false"`; regression `01-hybrid-proper-noun.test.ts` green; Chat/Agent thin wrappers call shared `hybridSearch` only |
| 4 | Graph RAG 实体关系问题可 trace Neo4j 路径 | ✓ VERIFIED | `graph-rag.ts` + `assertAllowlistedCypher`; `graph_search` tool → `graphRagQuery`; regression `06-graph-path.test.ts` + `graph-search.tool.test.ts` green (fixture path Product→Ingredient→Method) |
| 5 | workspace A/B 同名文档检索结果不交叉；corpus=user 时 citation 不得出现 psychology-qa（ISSUE-001 Closed） | ✓ VERIFIED | regression `02-corpus-isolation` + `05-workspace-isolation` green; `docs/issues/ISSUE-001-mixed-corpus-recall.md` status Closed; default `corpus ?? "user"` in hybrid |
| 6 | Postgres checkpointer 单实例同 `thread_id` 可恢复；Chat/Agent 共用 `packages/shared` hybrid 入口 | ✓ VERIFIED | `resolveCheckpointer` defaults `postgres`; `ensureCheckpointerSetup` in `main.ts`; regression `04-checkpointer-resume` green (messages+todos+citations); `THREAD_STORAGE_KEYS` chat/agent split; retrieve wrappers both import `hybridSearch` |
| 7 | 黄金集 ≥20（nightly）+ `tests/regression/phase-3/` 全绿 | ✓ VERIFIED | `golden.json` length 22; `yarn eval:phase-3` 2/2 pass; `yarn vitest run tests/regression/phase-3` **13/13 pass** |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `packages/shared/src/rag/hybrid-search.ts` | Shared hybrid entry | ✓ VERIFIED | 109 lines; RRF+rerank+Corrective; fail-open ES |
| `packages/shared/src/rag/rrf.ts` | Classic RRF | ✓ VERIFIED | Σ 1/(k+rank); unit + regression |
| `packages/shared/src/rag/corrective.ts` | Max 1 rewrite | ✓ VERIFIED | rule threshold; wired from hybrid |
| `packages/shared/src/rag/graph-rag.ts` | Narrow GraphRAG | ✓ VERIFIED | 258 lines; allowlist + read session |
| `packages/shared/src/rag/graph-cypher-allowlist.ts` | Cypher allowlist | ✓ VERIFIED | rejects WRITE/MERGE/etc. |
| `packages/shared/src/memory/short-term-redis.ts` | Redis short-term | ✓ VERIFIED | workspaceId+userKey scoped |
| `packages/shared/src/memory/mem0-client.ts` | Mem0 wrapper | ✓ VERIFIED | prefs/facts; degrade without key |
| `packages/shared/src/stores/vector-store.milvus.ts` | Milvus VectorStore | ✓ VERIFIED | upsert/delete/search + workspaceId assert |
| `packages/shared/src/stores/vector-store.factory.ts` | VECTOR_BACKEND factory | ✓ VERIFIED | astra default / milvus switch |
| `apps/ingest-worker/.../es-upsert.ts` | ES dual-write | ✓ VERIFIED | fail-closed on ES error |
| `script/migrate-corpus-split.ts` | Corpus split migrate | ✓ VERIFIED | `--dry-run` default; no writes observed |
| `apps/web/app/components/CorpusToggle.tsx` | corpus UI | ✓ VERIFIED | wired in `page.tsx` |
| `apps/agent-service/src/graph/build-graph.ts` | Postgres checkpointer | ✓ VERIFIED | default postgres + setup once |
| `tests/eval/phase-3/golden.json` | ≥20 golden | ✓ VERIFIED | 22 items |
| `docker-compose.yml` | ES (+ Milvus/Neo4j) | ✓ VERIFIED | elasticsearch/milvus/neo4j services present |
| `docs/issues/ISSUE-001-*.md` | Closed | ✓ VERIFIED | Closed 2026-08-21 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `apps/web/lib/chat/retrieve.ts` | `hybridSearch` | thin wrapper | ✓ WIRED | imports + calls with corpus/workspaceId |
| `apps/agent-service/src/rag/retrieve.ts` | `hybridSearch` | `retrieveKb` | ✓ WIRED | no Astra direct import |
| `kb_search` tool | `retrieveKb` | multi-query | ✓ WIRED | ≥2 calls tested |
| `graph_search` tool | `graphRagQuery` | allowlisted Cypher | ✓ WIRED | Retriever caps include both tools |
| `upsert.ts` | Astra/Milvus + `es-upsert` | fail-closed ES | ✓ WIRED | ES errors throw → job failed |
| `delete.ts` | Astra + ES | sync delete | ✓ WIRED | `deleteDocumentFromEs` after vector delete |
| `hybridSearch` | factory VectorStore | `createVectorStoreFromEnv` | ✓ WIRED | corpus-bound collections |
| Nest bootstrap | `PostgresSaver.setup()` | once at boot | ✓ WIRED | `main.ts` + `ensureCheckpointerSetup` |
| Chat/Agent UI | `thread_id` / `userKey` | localStorage | ✓ WIRED | `thread-id.ts`, `user-key.ts`, `page.tsx` |
| enterprise-roadmap | ROADMAP Phase 3 | D-04/D-06 dual-write | ✓ WIRED | same 四 wave + 7-day protocol |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `hybridSearch` | `vectorHits` / `esHits` | VectorStore.search + esBm25Search | Yes (deps injectable; regression mocks real ranking) | ✓ FLOWING |
| `getRelevantContext` | `mergedHits` | `hybridSearch` loop | Yes | ✓ FLOWING |
| `retrieveKb` | `chunks` | `hybridSearch` + minSimilarity filter | Yes | ✓ FLOWING |
| `loadMemoryContextBlock` | memory block string | Redis + Mem0 | Yes (mock in CI; live optional) | ✓ FLOWING |
| `graphRagQuery` | `paths` | Neo4j read / fixture executor | Yes (fixture in CI) | ✓ FLOWING |
| checkpointer resume | `todos`/`citations` | AgentState + saver | Yes (MemorySaver sim in regression) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| phase-3 regression 01–06 | `yarn vitest run tests/regression/phase-3` | 6 files, 13 tests passed | ✓ PASS |
| GOLDEN-01 smoke | `yarn eval:phase-3` | 2/2 passed; golden ≥20 | ✓ PASS |
| Corrective / RRF / Cypher / kb_search | `vitest run …corrective|rrf|graph-cypher|kb-search.tool` | 20/20 passed | ✓ PASS |
| migrate dry-run | `npx tsx script/migrate-corpus-split.ts --dry-run` | "dry-run complete — no collections mutated" | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | No phase-declared `scripts/*/tests/probe-*.sh` | SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| MEM-01 | 03-04 | Redis 短期会话记忆 | ✓ SATISFIED | `short-term-redis.ts` + chat/agent inject |
| MEM-02 | 03-04 | 长期记忆 Mem0 跨会话 | ✓ SATISFIED | `mem0-client.ts` + regression 03 |
| STORE-01 | 03-01/02/06/07 | Milvus / ES / Neo4j 多存储 | ✓ SATISFIED | compose + milvus store + ES dual-write + graph |
| RAG-05 | 03-03 | Agentic RAG 多轮检索 | ✓ SATISFIED | kb_search multi-call + Corrective pipeline |
| RAG-06 | 03-01–03b/07 | 混合检索 + Graph RAG | ✓ SATISFIED | hybrid+RRF+rerank + graph_search; **tracking table still says Pending — stale docs** |
| GOLDEN-01 | 00/00b/03b | ≥20 golden + CI smoke | ✓ SATISFIED | 22 items + `eval:phase-3` |
| CP-01 | 00/05 | Postgres checkpointer resume | ✓ SATISFIED | default postgres + regression 04 |
| CORPUS-01 | 00b/02/03b | 物理分库 + default user + ISSUE-001 Closed | ✓ SATISFIED | corpus targets + migrate + ISSUE Closed |

All listed Phase 3 requirement IDs from PLAN frontmatter are accounted for. No orphaned Phase 3 IDs missing from plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `.planning/REQUIREMENTS.md` | ~133 | Tracking row `RAG-06 \| Pending (… Graph → 03-07)` after 03-07 complete | ℹ️ Info | Checkbox `[x]` and code satisfy RAG-06; update row to Complete |
| `apps/ingest-worker/.../delete.ts` | — | Deletes Astra+ES only (not Milvus when `VECTOR_BACKEND=milvus`) | ℹ️ Info | Plan wording is Astra+ES; milvus-primary delete path may need follow-up |
| Phase key sources | — | No TBD/FIXME/XXX debt markers | — | Clean |

### Human Verification Required

### 1. Live ES dual-write smoke

**Test:** `docker compose up -d elasticsearch`; upload a KB document; confirm ES index + vector store both receive chunks; delete clears both.  
**Expected:** Ingest succeeds; ES docs present; delete syncs.  
**Why human:** Needs live container; CI mocks ES.

### 2. Live Neo4j Graph path

**Test:** Start Neo4j, seed milk-tea subgraph, ask entity-relation question via Agent `graph_search`.  
**Expected:** Traceable Product→Ingredient→Method path in tool output.  
**Why human:** CI uses fixture executor, not live bolt.

### 3. Optional live Mem0

**Test:** With Mem0 credentials, session A preference → session B recall.  
**Expected:** Cross-session preference in memory block.  
**Why human:** External SaaS; mock allowed for CI green.

### 4. Optional live rerank provider

**Test:** Proper-noun query with real Cross-Encoder / dedicated rerank API.  
**Expected:** Improved ranking; `ENABLE_RERANKER=false` disables.  
**Why human:** Provider quota/network.

### Gaps Summary

No roadmap Success Criteria failed. Automated evidence (regression 13/13, eval smoke, unit suites, artifact wiring L1–L4) supports full Phase 3 goal achievement in code. Remaining items are live-infrastructure / optional-provider smokes → status `human_needed`, not `gaps_found`.

**Doc hygiene (non-blocking):** Flip REQUIREMENTS.md RAG-06 tracking cell from Pending → Complete now that 03-07 Graph landed.

---

_Verified: 2026-08-21T17:01:10Z_  
_Verifier: Claude (gsd-verifier)_
