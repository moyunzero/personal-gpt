---
phase: 03-rag
plan: 03b
subsystem: testing
tags: [GOLDEN-01, CORPUS-01, RAG-06, ISSUE-001, regression, vitest]

requires:
  - phase: 03-rag
    provides: 03-01/03-02/03-03 hybridSearch + corpus split + Corrective wired
provides:
  - Green phase-3 regression 01 (proper-noun RRF) and 02 (corpus isolation)
  - ISSUE-001 Closed with Wave1 evidence (D-31)
  - GOLDEN-01 golden.json ≥20 + yarn eval:phase-3 CI smoke
affects:
  - Wave 1 quality merge gate
  - Milestone nightly golden / LangSmith evaluate entry

tech-stack:
  added: []
  patterns:
    - "Regression mocks inject hybridSearch deps (getStore/esSearch) — no live LLM"
    - "GOLDEN-01 CI smoke = Vitest subset; nightly LangSmith evaluate documented separately"
    - "Phase 3 GOLDEN-01 ≠ Phase 5 EVAL-01 (RAGAS)"

key-files:
  created:
    - tests/eval/phase-3/golden.json
    - tests/eval/phase-3/smoke.test.ts
  modified:
    - tests/regression/phase-3/01-hybrid-proper-noun.test.ts
    - tests/regression/phase-3/02-corpus-isolation.test.ts
    - docs/issues/ISSUE-001-mixed-corpus-recall.md
    - package.json

key-decisions:
  - "01/02 filled with hybridSearch+RRF mocks proving D-30; no production Astra/ES in CI"
  - "ISSUE-001 Closed after green 01/02 + migrate-corpus-split documented runnable (D-31)"
  - "golden.json has 22 synthetic items; CI smoke runs g01–g05 via yarn eval:phase-3"
  - "Nightly full ≥20 + LangSmith evaluate reserved as eval:phase-3:nightly placeholder"

patterns-established:
  - "Phase-3 regression: mock VectorStore + esSearch against real hybridSearch/RRF"
  - "Eval smoke reads golden.json schema + deterministic hybrid citation checks"

requirements-completed: [GOLDEN-01, CORPUS-01]
# RAG-06 hybrid gate proven by regression 01; full REQ (incl. Graph) stays open until 03-07

coverage:
  - id: D1
    description: Proper-noun hybrid+RRF ranks user doc over vector noise
    requirement: RAG-06
    verification:
      - kind: unit
        ref: "tests/regression/phase-3/01-hybrid-proper-noun.test.ts#hybridSearch surfaces proper-noun user doc via BM25+RRF (corpus=user)"
        status: pass
    human_judgment: false
  - id: D2
    description: corpus=user never returns psychology-qa citations
    requirement: CORPUS-01
    verification:
      - kind: unit
        ref: "tests/regression/phase-3/02-corpus-isolation.test.ts#forbids psychology-qa citation when corpus=user (ISSUE-001 / migrate-corpus-split)"
        status: pass
    human_judgment: false
  - id: D3
    description: ISSUE-001 document status Closed with Wave1 evidence
    requirement: CORPUS-01
    verification:
      - kind: other
        ref: "docs/issues/ISSUE-001-mixed-corpus-recall.md#状态 Closed"
        status: pass
    human_judgment: false
  - id: D4
    description: GOLDEN-01 ≥20 fixtures + deterministic CI smoke
    requirement: GOLDEN-01
    verification:
      - kind: unit
        ref: "yarn eval:phase-3 → tests/eval/phase-3/smoke.test.ts"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-21
status: complete
---

# Phase 03 Plan 03b: Wave1c Quality Gate Summary

**Regression 01/02 green with hybridSearch/RRF mocks; ISSUE-001 Closed; GOLDEN-01 22-item golden set + `yarn eval:phase-3` CI smoke (not RAGAS).**

## Performance

- **Duration:** 4min
- **Started:** 2026-08-21T15:47:37Z
- **Completed:** 2026-08-21T15:51:30Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments

- Filled phase-3 regression 01 (proper-noun BM25+RRF) and 02 (corpus isolation forbids `psychology-qa`) — both green, no skips
- Closed ISSUE-001 with Wave1 evidence links (physical split, migrate CLI, hybrid wire, regression commands)
- Landed GOLDEN-01: `golden.json` (22 items) + deterministic smoke + `eval:phase-3` / `eval:phase-3:nightly` scripts

## Task Commits

Each task was committed atomically:

1. **Task 1: Green 01/02 regression + ISSUE-001 Closed** - `eb0b80b` (test) + `2724cf2` (docs force-add; `docs/` gitignored)
2. **Task 2: GOLDEN-01 golden set + CI smoke** - `8e4be7f` (feat)

**Plan metadata:** `dc8dff4` (docs: complete plan)

## Files Created/Modified

- `tests/regression/phase-3/01-hybrid-proper-noun.test.ts` — RRF + hybridSearch proper-noun mocks
- `tests/regression/phase-3/02-corpus-isolation.test.ts` — corpus=user never queries seed / no psychology-qa
- `docs/issues/ISSUE-001-mixed-corpus-recall.md` — status Closed + Wave1 evidence table
- `tests/eval/phase-3/golden.json` — 22 golden items (query/corpus/citation constraints)
- `tests/eval/phase-3/smoke.test.ts` — schema + smoke subset g01–g05
- `package.json` — `eval:phase-3` → vitest smoke; nightly placeholder script

## Decisions Made

- Mocks call real `hybridSearch` / `reciprocalRankFusion` with injected stores (proves D-30 without live Astra/ES)
- ISSUE Closed requires force-add under gitignored `docs/` (tracked once for D-31)
- GOLDEN-01 CI uses Vitest only; LangSmith evaluate deferred to nightly script comment/placeholder
- No Phase-3 artifact uses EVAL-01 / RAGAS IDs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `docs/` gitignored blocked ISSUE-001 stage**
- **Found during:** Task 1 commit
- **Issue:** `git add docs/issues/ISSUE-001-...` ignored; Closed status would not land in history
- **Fix:** `git add -f` + follow-up `docs(03-03b)` commit
- **Files modified:** `docs/issues/ISSUE-001-mixed-corpus-recall.md`
- **Verification:** file tracked; status Closed in HEAD
- **Committed in:** `2724cf2`

**2. [Rule 1 - Bug] Did not mark RAG-06 Complete in REQUIREMENTS**
- **Found during:** state updates after SUMMARY
- **Issue:** Plan lists RAG-06, but REQ text includes Graph RAG (still 03-07)
- **Fix:** Keep RAG-06 Pending; mark only GOLDEN-01 + CORPUS-01; hybrid proven via regression 01
- **Files modified:** `.planning/REQUIREMENTS.md`, `03-03b-SUMMARY.md`
- **Verification:** REQUIREMENTS checkbox unchecked for RAG-06; traceability notes hybrid green / Graph deferred

## Known Stubs

None that block plan goals. `eval:phase-3:nightly` remains a documented placeholder (intentional — do not block on live LangSmith). Regression stubs 03–06 remain for later waves.

## Threat Flags

None — eval fixtures are synthetic; no new network endpoints.

## Self-Check: PASSED

- FOUND: tests/regression/phase-3/01-hybrid-proper-noun.test.ts
- FOUND: tests/regression/phase-3/02-corpus-isolation.test.ts
- FOUND: tests/eval/phase-3/golden.json
- FOUND: tests/eval/phase-3/smoke.test.ts
- FOUND: docs/issues/ISSUE-001-mixed-corpus-recall.md
- FOUND commits: eb0b80b, 2724cf2, 8e4be7f
