---
phase: 03-rag
plan: 00b
subsystem: testing
tags: [nyquist, vitest, regression, corpus-migration, GOLDEN-01, CORPUS-01]

requires:
  - phase: 03-rag
    provides: 03-00 dual-write D-04/D-06 + VALIDATION draft
provides:
  - Phase-3 regression suite skeleton (01–06) runnable via yarn test:regression:phase-3
  - Shared rag/memory unit stubs (RRF, corrective, ShortTermRedisMemory)
  - migrate-corpus-split dry-run CLI (no Astra writes)
  - VALIDATION wave_0_complete + nyquist_compliant
affects:
  - PGPT-03-rag plans 03-01 through 03-07 (fill stubs green)
  - Wave 1c / 03-03b GOLDEN-01 eval:phase-3

tech-stack:
  added: []
  patterns:
    - "Nyquist Wave 0: it.todo + placeholder harness; soft-skip import until production module lands"
    - "migrate CLI: dry-run default; refuse --execute until later plan"
    - "Root vitest include packages/**/*.test.ts for VALIDATION sampling paths"

key-files:
  created:
    - tests/regression/phase-3/01-hybrid-proper-noun.test.ts
    - tests/regression/phase-3/02-corpus-isolation.test.ts
    - tests/regression/phase-3/03-memory-recall.test.ts
    - tests/regression/phase-3/04-checkpointer-resume.test.ts
    - tests/regression/phase-3/05-workspace-isolation.test.ts
    - tests/regression/phase-3/06-graph-path.test.ts
    - packages/shared/src/rag/rrf.test.ts
    - packages/shared/src/rag/corrective.test.ts
    - packages/shared/src/memory/short-term-redis.test.ts
    - script/migrate-corpus-split.ts
  modified:
    - package.json
    - vitest.config.ts
    - .planning/phases/PGPT-03-rag/03-VALIDATION.md

key-decisions:
  - "rag-options.test ENABLE_RERANKER flip deferred to Wave 1 / plan 03-03 (not Wave 0b)"
  - "eval:phase-3 is a node -e smoke placeholder until GOLDEN-01 / 03-03b"
  - "migrate-corpus-split refuses --execute in Wave 0 (T-03-00-01)"

patterns-established:
  - "Phase-3 regression files: placeholder harness + it.todo pointing to future modules"
  - "Shared stubs soft-skip missing ./module.js then it.todo naming the symbol"

requirements-completed: [CORPUS-01, GOLDEN-01]

coverage:
  - id: D1
    description: Six phase-3 regression stubs collectible via yarn test:regression:phase-3 (todo allowed)
    requirement: CORPUS-01
    verification:
      - kind: unit
        ref: "yarn test:regression:phase-3"
        status: pass
    human_judgment: false
  - id: D2
    description: migrate-corpus-split --dry-run prints plan and does not write Astra
    requirement: CORPUS-01
    verification:
      - kind: other
        ref: "npx tsx script/migrate-corpus-split.ts --dry-run"
        status: pass
    human_judgment: false
  - id: D3
    description: eval:phase-3 CI smoke placeholder for GOLDEN-01
    requirement: GOLDEN-01
    verification:
      - kind: other
        ref: "yarn eval:phase-3"
        status: pass
    human_judgment: false
  - id: D4
    description: Shared rag/memory unit stubs soft-skip until Wave 1/2 modules
    verification:
      - kind: unit
        ref: "yarn vitest run packages/shared/src/rag/rrf.test.ts packages/shared/src/rag/corrective.test.ts packages/shared/src/memory/short-term-redis.test.ts"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-08-21
status: complete
---

# Phase 03 Plan 00b: Nyquist stubs Summary

**Phase-3 Nyquist Wave 0b: six regression skeletons, shared RRF/corrective/Redis stubs, migrate dry-run CLI, and package.json sampling scripts with VALIDATION wave_0_complete.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-21T14:41:43Z
- **Completed:** 2026-08-21T14:49:19Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Created `tests/regression/phase-3/` cases 01–06 (placeholder + `it.todo`) covering hybrid, corpus isolation, memory, checkpointer, workspace, graph
- Added `test:regression:phase-3` / `eval:phase-3`; extended `test:regression` to include phase-3
- Soft-skip shared unit stubs for `reciprocalRankFusion`, `maybeCorrective`/`correctiveRewriteOnce`, `ShortTermRedisMemory`
- `script/migrate-corpus-split.ts` dry-run prints source→user/seed plan; refuses `--execute` (T-03-00-01)
- Marked `03-VALIDATION.md` `wave_0_complete: true` / `nyquist_compliant: true`; File Exists → stub-present

## Task Commits

Each task was committed atomically:

1. **Task 1: phase-3 regression stubs + package.json scripts** - `23e4beb` (test)
2. **Task 2: shared unit stubs + migrate dry-run + VALIDATION frontmatter** - `a95e32e` (test)

**Plan metadata:** see docs commit after SUMMARY land

## Files Created/Modified

- `tests/regression/phase-3/01`–`06-*.test.ts` — Nyquist regression skeletons
- `packages/shared/src/rag/{rrf,corrective}.test.ts` — RRF / Corrective stubs
- `packages/shared/src/memory/short-term-redis.test.ts` — ShortTermRedisMemory stub
- `script/migrate-corpus-split.ts` — dry-run corpus split CLI
- `package.json` — regression/eval scripts
- `vitest.config.ts` — include `packages/**/*.test.ts`
- `.planning/phases/PGPT-03-rag/03-VALIDATION.md` — Wave 0 complete

## Decisions Made

- Deferred `rag-options.test` rerank-default-on update to Wave 1 / plan 03-03 (documented in VALIDATION checklist)
- `eval:phase-3` remains a deterministic smoke print until GOLDEN-01 lands in 03-03b
- Wave 0 migrate path has no write implementation — `--execute` exits 1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Root vitest did not collect packages/shared tests**
- **Found during:** Task 2 (verify command)
- **Issue:** Root `vitest.config.ts` include omitted `packages/**/*.test.ts`, so plan verify `yarn vitest run packages/shared/...` found no files
- **Fix:** Added `packages/**/*.test.ts` to root vitest include (VALIDATION sampling paths)
- **Files modified:** `vitest.config.ts`
- **Verification:** Three shared stub files pass under root vitest
- **Committed in:** `a95e32e` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for VALIDATION/plan verify commands; no scope creep.

## Issues Encountered

None beyond the vitest include gap above.

## User Setup Required

None - no external service configuration required for Wave 0 stubs.

## Next Phase Readiness

- Wave 1+ plans can fill stubs green (`03-01` hybrid/RRF/corrective, `03-02` memory/migrate execute, etc.)
- `yarn test:regression:phase-3` is the sampling entrypoint

## Known Stubs

Intentional Wave 0 placeholders (not production gaps for this plan's goal):

| File | Stub | Reason |
|------|------|--------|
| `tests/regression/phase-3/01`–`06` | `it.todo` | Filled by Wave 1–4 plans |
| `packages/shared/src/rag/*.test.ts` | soft-skip + todo | Modules land in 03-01 |
| `packages/shared/src/memory/short-term-redis.test.ts` | soft-skip + todo | Module lands in 03-02 |
| `package.json` `eval:phase-3` | `node -e` print | GOLDEN-01 / 03-03b |
| `script/migrate-corpus-split.ts` | dry-run only | Real copy in 03-02 |

## Self-Check: PASSED

- FOUND: six `tests/regression/phase-3/*.test.ts`
- FOUND: shared stub tests + migrate script
- FOUND: commits `23e4beb`, `a95e32e`
- FOUND: `03-VALIDATION.md` wave_0_complete true

---
*Phase: 03-rag*
*Completed: 2026-08-21*
