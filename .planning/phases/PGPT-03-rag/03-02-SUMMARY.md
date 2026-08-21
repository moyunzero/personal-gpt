---
phase: 03-rag
plan: 02
subsystem: rag
tags: [ingest, dual-write, elasticsearch, corpus-split, astra, CORPUS-01, STORE-01, RAG-06]

requires:
  - phase: 03-rag
    provides: 03-01 ES client + hybridSearch + resolveCorpusTargets
provides:
  - Astra createVectorStore corpus/collectionName targeting (D-24)
  - Ingest dual-write Astra+ES fail-closed (D-09/D-10)
  - deleteDocument sync-clears ES + Astra
  - migrate-corpus-split --dry-run / gated --execute (D-26)
affects:
  - PGPT-03-rag 03-03 Chat/Agent hybrid call-site + corpus UI
  - PGPT-03-rag 03-03b ISSUE-001 Closed after regression
  - CORPUS-01 / seed loaders

tech-stack:
  added: []
  patterns:
    - "Ingest write path fail-closed on ES; query path fail-open (03-01)"
    - "createVectorStore({ corpus }) → resolveCorpusTargets collection"
    - "migrate copy-only; legacy collection read-only until verified"

key-files:
  created:
    - apps/ingest-worker/src/ingest/pipeline/es-upsert.ts
    - apps/ingest-worker/src/ingest/pipeline/es-upsert.test.ts
    - apps/ingest-worker/src/ingest/pipeline/delete.ts
  modified:
    - packages/shared/src/stores/vector-store.astra.ts
    - packages/shared/src/stores/vector-store.ts
    - packages/shared/src/stores/vector-store.test.ts
    - packages/shared/src/rag/es-bm25.ts
    - apps/ingest-worker/src/ingest/pipeline/upsert.ts
    - apps/ingest-worker/src/ingest/ingest.processor.ts
    - apps/web/lib/kb/documents.service.ts
    - script/migrate-corpus-split.ts
    - script/loadPsychologyData.ts
    - script/loadPromptSuggestions.ts

key-decisions:
  - "Default createVectorStore corpus=user; USER/SEED env preferred with legacy ASTRA_DB_COLLECTION fallback (D-26)"
  - "ES write errors throw — BullMQ job failed + retry (D-10); never swallow"
  - "--execute requires explicit ASTRA_DB_COLLECTION_USER and ASTRA_DB_COLLECTION_SEED"
  - "Chat retrieve / corpus UI deferred to 03-03 (plan scope); seed scripts route to corpus=seed"
  - "Do not mark ISSUE-001 Closed or CORPUS-01 complete until 03-03b regression green"

patterns-established:
  - "upsertChunks(chunks, corpus?) = Astra then upsertChunksToEs; deleteDocument clears both"
  - "Seed loaders resolveCorpusTargets('seed') for physical collection"

requirements-completed: []  # STORE-01/RAG-06/CORPUS-01 progress only; CORPUS-01 needs ISSUE-001 Closed in 03-03b

coverage:
  - id: D1
    description: createVectorStore can target distinct user vs seed Astra collections
    requirement: CORPUS-01
    verification:
      - kind: unit
        ref: "packages/shared/src/stores/vector-store.test.ts#resolveAstraCollectionName targets distinct user vs seed collections"
        status: pass
    human_judgment: false
  - id: D2
    description: upsert pipeline fail-closed when ES throws (D-10)
    requirement: STORE-01
    verification:
      - kind: unit
        ref: "apps/ingest-worker/src/ingest/pipeline/es-upsert.test.ts#upsertChunks rejects when ES indexChunks throws (fail-closed)"
        status: pass
    human_judgment: false
  - id: D3
    description: deleteDocument removes ES docs for documentId
    requirement: RAG-06
    verification:
      - kind: unit
        ref: "apps/ingest-worker/src/ingest/pipeline/es-upsert.test.ts#deleteDocumentFromEs removes docs for documentId"
        status: pass
    human_judgment: false
  - id: D4
    description: migrate-corpus-split --dry-run exits 0 without mutations
    requirement: CORPUS-01
    verification:
      - kind: other
        ref: "npx tsx script/migrate-corpus-split.ts --dry-run"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-08-21
status: complete
---

# Phase 03 Plan 02: Ingest dual-write + corpus split Summary

**Ingest dual-writes Astra+ES fail-closed, Astra/ES physical corpus targets, and migrate-corpus-split --execute path for ISSUE-001**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-21T15:00:45Z
- **Completed:** 2026-08-21T15:07:41Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- `createVectorStore` / `createAstraVectorStore` accept `corpus` or `collectionName` via `resolveAstraCollectionName` (USER/SEED preferred, legacy fallback)
- BullMQ upsert dual-writes ES after Astra; ES errors reject the job; delete paths clear both stores
- `migrate-corpus-split` dry-run safe; `--execute` gated on explicit USER/SEED env with copy-only + idempotent skip

## Task Commits

Each task was committed atomically:

1. **Task 1: Astra multi-collection by corpus (D-24)** - `262d74d` (feat)
2. **Task 2: Ingest dual-write ES fail-closed (D-09/D-10)** - `340453d` (feat)
3. **Task 3: migrate-corpus-split executable path (D-26)** - `bb3b152` (feat)

**Plan metadata:** (docs commit after this SUMMARY)

## Files Created/Modified

- `packages/shared/src/stores/vector-store.astra.ts` — corpus collection resolution
- `apps/ingest-worker/src/ingest/pipeline/es-upsert.ts` — ES dual-write helpers
- `apps/ingest-worker/src/ingest/pipeline/es-upsert.test.ts` — fail-closed proofs
- `apps/ingest-worker/src/ingest/pipeline/upsert.ts` / `delete.ts` — Astra+ES write/delete
- `apps/ingest-worker/src/ingest/ingest.processor.ts` — cleanup via deleteDocument
- `apps/web/lib/kb/documents.service.ts` — KB delete syncs ES
- `packages/shared/src/rag/es-bm25.ts` — bulk item errors throw
- `script/migrate-corpus-split.ts` — dry-run + gated execute
- `script/loadPsychologyData.ts` / `loadPromptSuggestions.ts` — corpus=seed collection

## Decisions Made

- Chat/Agent retrieve flip and corpus UI (`corpus=seed|user`) remain plan 03-03 — this plan only ships write-side + migration
- `--execute` requires explicit `ASTRA_DB_COLLECTION_USER` + `ASTRA_DB_COLLECTION_SEED` to avoid mis-route (T-03-02-02)
- ISSUE-001 / CORPUS-01 not Closed until 03-03b regression green

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical] Web KB delete must sync ES (D-09)**
- **Found during:** Task 2
- **Issue:** Plan listed ingest `delete.ts` only; `documents.service.deleteDocument` would leave ES orphans
- **Fix:** After Astra delete, call `deleteByDocumentId` on user ES index
- **Files modified:** `apps/web/lib/kb/documents.service.ts`
- **Committed in:** `340453d`

**2. [Rule 2 - Critical] ES bulk must surface item errors**
- **Found during:** Task 2
- **Issue:** `indexChunks` ignored `result.errors`, risking silent partial writes
- **Fix:** Throw when bulk reports item errors
- **Files modified:** `packages/shared/src/rag/es-bm25.ts`
- **Committed in:** `340453d`

---

**Total deviations:** 2 auto-fixed (Rule 2 ×2)
**Impact on plan:** Correctness for D-09/D-10 only; no scope creep into Chat UI.

## Issues Encountered

None blocking. Dry-run live Astra count skipped with 403 in this environment (still exit 0).

## User Setup Required

For `--execute` migration: set `ASTRA_DB_COLLECTION_USER`, `ASTRA_DB_COLLECTION_SEED` (distinct from legacy `ASTRA_DB_COLLECTION`), plus Astra token/endpoint. Optional `--with-es` needs live `ES_NODE`.

## Next Phase Readiness

- Ready for **03-03** Chat/Agent `hybridSearch` + corpus UI routing (D-27–D-29)
- Ready for **03-03b** ISSUE-001 Closed after phase-3 corpus isolation regression green
- Run `migrate-corpus-split --execute` in credentialed env before treating legacy collection as deletable

## Self-Check: PASSED

- Files: es-upsert.ts, delete.ts, migrate-corpus-split.ts, vector-store.astra.ts — FOUND
- Commits: 262d74d, 340453d, bb3b152 — FOUND
- Verify: vector-store + es-upsert tests pass; migrate `--dry-run` exit 0; ingest-worker `tsc` pass

---
*Phase: 03-rag*
*Completed: 2026-08-21*
