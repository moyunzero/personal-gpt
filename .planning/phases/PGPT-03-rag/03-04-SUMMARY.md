---
phase: 03-rag
plan: 04
subsystem: memory
tags: [MEM-01, MEM-02, Redis, Mem0, ioredis, mem0ai, short-term, long-term]

requires:
  - phase: 03-rag
    provides: 03-03b Wave1c quality gate + shared RAG base
provides:
  - ShortTermRedisMemory (N turns + rolling summary, workspaceId:userKey)
  - Scoped Mem0 client (prefs/facts only, mem0ai@3.1.6)
  - Chat + Agent memory injection + userKey localStorage
  - Green 03-memory-recall regression
affects:
  - Wave 2 memory closeout demos
  - Phase 4 auth userId mapping (D-18)

tech-stack:
  added: [ioredis@5.11.1 in shared, mem0ai@3.1.6]
  patterns:
    - "Memory key = MEMORY_KEY_PREFIX:workspaceId:userKey (D-18)"
    - "Fail-open Redis/Mem0 — empty context, never 500 chat"
    - "Mem0 addStableFacts only — no full-transcript dump API (D-19)"
    - "Regression mocks FakeRedis + Mem0RawClient"

key-files:
  created:
    - packages/shared/src/memory/short-term-redis.ts
    - packages/shared/src/memory/mem0-client.ts
    - packages/shared/src/memory/session-memory.ts
    - apps/web/lib/chat/user-key.ts
    - apps/web/lib/chat/memory-context.ts
  modified:
    - packages/shared/src/schemas/env.ts
    - packages/shared/src/index.ts
    - apps/web/app/api/chat/route.ts
    - apps/web/app/page.tsx
    - apps/web/lib/chat/stream.ts
    - apps/agent-service/src/agent/agent.service.ts
    - apps/agent-service/src/graph/build-graph.ts
    - tests/regression/phase-3/03-memory-recall.test.ts
    - .env.example

key-decisions:
  - "In-memory FakeRedis for unit/regression — no ioredis-mock dep"
  - "extractStableFactsFromUserText heuristic (no LLM) for D-19 writes"
  - "session-memory helpers live in shared so Chat and Agent share one path"
  - "Stream-end persist trigger (Claude discretion) rather than idle timeout"

patterns-established:
  - "Opaque localStorage userKey paired with workspaceId until Phase 4 auth"
  - "Memory context appended to Chat system prompt / Agent SystemMessage + Supervisor prompt"

requirements-completed: [MEM-01, MEM-02]

coverage:
  - id: D1
    description: Redis short-term memory scoped by workspaceId+userKey with N-cap and fail-open
    requirement: MEM-01
    verification:
      - kind: unit
        ref: "packages/shared/src/memory/short-term-redis.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: Mem0 scoped client for prefs/facts only; pin mem0ai@3.1.6
    requirement: MEM-02
    verification:
      - kind: other
        ref: "packages/shared/package.json#mem0ai@3.1.6"
        status: pass
    human_judgment: false
  - id: D3
    description: Session A preference recalled in session B via mock Redis+Mem0
    requirement: MEM-02
    verification:
      - kind: unit
        ref: "tests/regression/phase-3/03-memory-recall.test.ts#recalls preference from session A in session B"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-08-21
status: complete
---

# Phase 03 Plan 04: Redis short-term + Mem0 long-term Summary

**Redis N-turn + rolling summary and Mem0 prefs/facts, injected into Chat and Agent with green 03-memory-recall regression.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-21T15:54:11Z
- **Completed:** 2026-08-21T16:00:41Z
- **Tasks:** 3/3
- **Files modified:** 16

## Accomplishments

- ShortTermRedisMemory with key isolation, N-cap, rolling summary, Redis fail-open
- Scoped Mem0 wrapper (`memoryUserId`, `addStableFacts`, `searchMemories`) pinned to mem0ai@3.1.6
- Chat + Agent inject short-term + long-term context; frontend sends opaque `userKey`
- Regression 03 green: preference stored in session A recalled in session B (mocked)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Redis short-term tests** - `6987861` (test)
2. **Task 1 (GREEN): ShortTermRedisMemory** - `51b046a` (feat)
3. **Task 2: Mem0 long-term client** - `8849898` (feat)
4. **Task 3: Chat/Agent inject + regression** - `3f9cf95` (feat)

**Plan metadata:** `661b054` (docs: complete plan)

## Files Created/Modified

- `packages/shared/src/memory/short-term-redis.ts` - Redis short-term memory
- `packages/shared/src/memory/mem0-client.ts` - Mem0 scoped wrapper + fact extraction
- `packages/shared/src/memory/session-memory.ts` - load/persist shared by Chat & Agent
- `apps/web/lib/chat/user-key.ts` - localStorage opaque userKey
- `apps/web/lib/chat/memory-context.ts` - Chat wrapper
- `apps/web/app/api/chat/route.ts` / `stream.ts` / `page.tsx` - inject + persist
- `apps/agent-service/.../agent.service.ts` / `build-graph.ts` - inject + persist
- `tests/regression/phase-3/03-memory-recall.test.ts` - session A→B

## Decisions Made

- FakeRedis instead of ioredis-mock for simpler unit tests
- Heuristic preference extraction (no LLM classifier) to keep CI free of live models
- Shared `session-memory` module so both modes call the same helpers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Singleton type for getShortTermRedisMemory**
- **Found during:** Task 2 (tsc after Mem0 install)
- **Issue:** `singleton: ShortTermRedisMemory | null | undefined` caused TS2322 on return
- **Fix:** Narrowed to `ShortTermRedisMemory | undefined`
- **Files modified:** `packages/shared/src/memory/short-term-redis.ts`
- **Verification:** `yarn workspace @personal-gpt/shared exec tsc --noEmit`
- **Committed in:** `8849898`

**2. [Rule 2 - Missing critical functionality] Shared session-memory for Agent**
- **Found during:** Task 3
- **Issue:** Agent cannot import `apps/web/lib/chat/memory-context`
- **Fix:** Moved load/persist into `packages/shared/src/memory/session-memory.ts`
- **Files modified:** `session-memory.ts`, `memory-context.ts`, `agent.service.ts`
- **Verification:** regression 03 green
- **Committed in:** `3f9cf95`

**Total deviations:** 2 auto-fixed (Rule 1 ×1, Rule 2 ×1)
**Impact on plan:** Correctness only; no scope creep.

## Issues Encountered

None beyond the auto-fixes above.

## User Setup Required

Optional for live Mem0: set `MEM0_API_KEY` in `.env` (see `.env.example`). CI uses mocks and does not require the key.

## Next Phase Readiness

Wave 2a memory (03-04) complete. Next incomplete plans: 03-05 / 03-06 / 03-07 (multi-store / Graph). MEM-01/02 observably green via unit + regression.

## Self-Check: PASSED

- Created files: all FOUND
- Commits: 6987861, 51b046a, 8849898, 3f9cf95 FOUND

---
*Phase: 03-rag*
*Completed: 2026-08-21*
