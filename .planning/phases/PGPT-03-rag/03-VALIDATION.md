---
phase: 3
slug: rag
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-21
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `03-RESEARCH.md` ## Validation Architecture

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.6 |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `yarn vitest run tests/regression/phase-3 --reporter=dot` |
| **Full suite command** | `yarn test:regression && yarn vitest run tests/regression/phase-3` |
| **Estimated runtime** | ~60–180 seconds (phase-3 alone ~30–60s) |

---

## Sampling Rate

- **After every task commit:** Run targeted unit test for touched module (`yarn vitest run <file>`)
- **After every plan wave:** Run `yarn vitest run tests/regression/phase-3` + prior phase-1/2 regression
- **Before `/gsd-verify-work`:** Full suite must be green + golden ≥20 nightly for Milestone
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| W0 stubs | 00b | 0 | — | — | N/A | unit/regression stubs | `tests/regression/phase-3/*` | ✅ stub-present | ⬜ pending |
| hybrid RRF | 01 | 1 | RAG-06 | T-03-seed | corpus=user never returns psychology-qa | regression | `vitest run tests/regression/phase-3/01-hybrid-proper-noun.test.ts` | ✅ stub-present | ⬜ pending |
| Corrective | 01 | 1 | RAG-05/06 | — | ≤1 rewrite on low score | unit | `vitest run packages/shared/src/rag/corrective.test.ts` | ✅ stub-present | ⬜ pending |
| corpus isolation | 01 | 1 | ISSUE-001 / D-30 | T-03-seed | no psychology-qa citation | regression | `vitest run tests/regression/phase-3/02-corpus-isolation.test.ts` | ✅ stub-present | ⬜ pending |
| Redis memory | 02 | 2 | MEM-01 | T-03-memkey | workspaceId:userKey scoped | unit | `vitest run packages/shared/src/memory/short-term-redis.test.ts` | ✅ stub-present | ⬜ pending |
| Mem0 recall | 02 | 2 | MEM-02 | T-03-memkey | session A→B preference | regression | `vitest run tests/regression/phase-3/03-memory-recall.test.ts` | ✅ stub-present | ⬜ pending |
| checkpointer | 02 | 2 | D-20 | T-03-session | same thread_id resumes | integration | `vitest run tests/regression/phase-3/04-checkpointer-resume.test.ts` | ✅ stub-present | ⬜ pending |
| workspace A/B | 03 | 3 | STORE / DATA | T-03-ws | zero cross-workspace | regression | `vitest run tests/regression/phase-3/05-workspace-isolation.test.ts` | ✅ stub-present | ⬜ pending |
| Graph path | 04 | 4 | RAG-06 Graph | T-03-cypher | Neo4j path traceable | regression | `vitest run tests/regression/phase-3/06-graph-path.test.ts` | ✅ stub-present | ⬜ pending |
| golden eval | 03b | 4 | GOLDEN-01 | — | ≥20 citation accuracy | nightly + CI smoke | `yarn eval:phase-3` | ✅ stub-present (`eval:phase-3` smoke) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/regression/phase-3/` directory + cases 01–06 stubs
- [x] `packages/shared` rag/memory unit test stubs
- [ ] Update `apps/web/lib/chat/rag-options.test.ts` for rerank default **on** — **deferred to Wave 1 / plan 03-03** (do not flip `ENABLE_RERANKER` in Wave 0b)
- [x] `script/migrate-corpus-split.ts` dry-run mode
- [x] `yarn test:regression:phase-3` script in root `package.json`
- [x] Optional CI golden smoke (deterministic citation checks) — `yarn eval:phase-3` placeholder; GOLDEN-01 filled in Wave 1c / plan 03-03b

> Wave 0 Nyquist sampling gap closed for stubs/scripts/migrate dry-run. `rag-options.test` rerank-default update is intentionally Wave 1 (not a Wave 0b blocker).

---

## Wave gates (from RESEARCH)

| Wave | Demo / merge gate |
|------|-------------------|
| 1 质量 | Hybrid+RRF+rerank default+Corrective+corpus migration; ISSUE-001 Closed; cases 01–02 green |
| 2 记忆 | Redis+Mem0; case 03; Postgres checkpointer default; case 04 |
| 3 多存储 | Milvus VectorStore + factory; workspace case 05 |
| 4 Graph | Neo4j GraphRAG; case 06; Milestone full-union |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Compose ES up + ingest dual-write smoke | STORE / D-14 | Needs live ES container | `docker compose up -d elasticsearch`; upload doc; confirm ES docs |
| Mem0 live provider (if not mocked) | MEM-02 | External SaaS/key | Prefer mock in CI; live optional |
| Cross-Encoder / dedicated rerank API | RAG-06 | Provider quota | Unit with stub HTTP; live optional |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (stubs present; production fill in Wave 1+)
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter after Wave 0 lands

**Approval:** Wave 0 stubs approved for sampling; Wave 1+ fills green
