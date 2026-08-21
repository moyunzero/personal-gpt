---
phase: 03-rag
plan: 05
subsystem: checkpointer
tags: [CP-01, D-20, D-21, D-22, D-23, PostgresSaver, thread_id, LangGraph]

requires:
  - phase: 03-rag
    provides: 03-04 Wave2a memory (Redis + Mem0) + AgentState channels
provides:
  - PostgresSaver default checkpointer with bootstrap setup()
  - Checkpointed messages + todos + citations (SSE projection only)
  - Per-mode localStorage thread_id (chat/agent) + green 04 regression
affects:
  - Wave 2 checkpointer+memory merge gate
  - Phase 4 multi-replica sticky sessions / auth-bound thread_id

tech-stack:
  added: ["@langchain/langgraph-checkpoint-postgres@1.0.5"]
  patterns:
    - "AGENT_CHECKPOINTER default postgres; MemorySaver degrade without DATABASE_URL"
    - "PostgresSaver.setup() once at Nest bootstrap (not per-request)"
    - "localStorage keys pgpt.thread.chat / pgpt.thread.agent"

key-files:
  created:
    - apps/web/lib/chat/thread-id.ts
  modified:
    - apps/agent-service/src/graph/build-graph.ts
    - apps/agent-service/src/main.ts
    - apps/agent-service/src/agent/agent.service.ts
    - apps/agent-service/src/graph/build-graph.test.ts
    - packages/shared/src/schemas/env.ts
    - apps/web/app/page.tsx
    - apps/web/app/components/ModeSegmentedControl.tsx
    - apps/web/app/components/AppHeader.tsx
    - tests/regression/phase-3/04-checkpointer-resume.test.ts
    - .env.example

key-decisions:
  - "Default AGENT_CHECKPOINTER=postgres; explicit memory|sqlite for tests"
  - "No DATABASE_URL + unset mode → MemorySaver degrade (D-21), not crash"
  - "Resume regression uses MemorySaver restart simulation (no live PG/LLM)"
  - "Overrides Phase 2 D-08 MemorySaver default"

patterns-established:
  - "ensureCheckpointerSetup() at Nest bootstrap before listen"
  - "supervisor/sequential compile with AgentState; updateState persists todos/citations"
  - "Opaque per-mode thread_id in transport body"

requirements-completed: [CP-01]

coverage:
  - id: D1
    description: PostgresSaver default + bootstrap setup() once
    requirement: CP-01
    verification:
      - kind: unit
        ref: "apps/agent-service/src/graph/build-graph.test.ts#ensureCheckpointerSetup calls setup() once"
        status: pass
    human_judgment: false
  - id: D2
    description: Checkpoint restores messages+todos+citations for same thread_id
    requirement: CP-01
    verification:
      - kind: unit
        ref: "tests/regression/phase-3/04-checkpointer-resume.test.ts#resumes messages + todos + citations"
        status: pass
    human_judgment: false
  - id: D3
    description: Distinct localStorage thread keys for Chat vs Agent
    requirement: CP-01
    verification:
      - kind: unit
        ref: "tests/regression/phase-3/04-checkpointer-resume.test.ts#uses distinct localStorage keys"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-08-21
status: complete
---

# Phase 03 Plan 05: PostgresSaver default checkpointer Summary

**Default PostgresSaver with one-shot bootstrap setup(), checkpointed todos/citations, and per-mode thread_id persistence — CP-01 / D-20–D-23 closed over Phase 2 MemorySaver default.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-21T16:06:20Z
- **Completed:** 2026-08-21T16:17:30Z
- **Tasks:** 3/3
- **Files modified:** 12

## Accomplishments

- `@langchain/langgraph-checkpoint-postgres@1.0.5` pinned; `AGENT_CHECKPOINTER` default `postgres` with `setup()` at Nest bootstrap
- AgentState channels (messages/todos/citations) compiled into sequential + supervisor; SSE projects after `updateState`
- Frontend `pgpt.thread.chat` / `pgpt.thread.agent` + 新会话 rotate; regression 04 green without skip

## Task Commits

Each task was committed atomically:

1. **Task 1: PostgresSaver default + setup()** - `b5118bd` (feat)
2. **Task 2: Persist graph state fields + SSE projection** - `808ddb6` (feat)
3. **Task 3: Frontend thread_id + green 04 regression** - `5a33c90` (feat)

**Plan metadata:** `a48f83d` (docs: complete plan)

## Files Created/Modified

- `apps/agent-service/src/graph/build-graph.ts` - resolveCheckpointer postgres default, ensureCheckpointerSetup
- `apps/agent-service/src/main.ts` - bootstrap setup() once
- `apps/agent-service/src/agent/agent.service.ts` - updateState todos/citations after stream
- `apps/web/lib/chat/thread-id.ts` - per-mode localStorage thread ids
- `apps/web/app/page.tsx` - send thread_id; new-thread action
- `tests/regression/phase-3/04-checkpointer-resume.test.ts` - CP-01 green

## Decisions Made

- Degrade to MemorySaver when default postgres but no `DATABASE_URL` (unit tests / local without PG)
- Explicit `AGENT_CHECKPOINTER=postgres` without URL throws
- Multi-replica sticky sessions deferred to Phase 4 (per CONTEXT)

## Deviations from Plan

None - plan executed exactly as written.

Minor note: regression uses MemorySaver restart simulation rather than Testcontainers Postgres (plan allowed mock saver for unit speed).

## Issues Encountered

None

## User Setup Required

For real Postgres checkpoints in local/prod:

1. Set `DATABASE_URL` (already in `.env.example`)
2. Leave `AGENT_CHECKPOINTER=postgres` (or omit — default)
3. Restart agent-service so bootstrap runs `PostgresSaver.setup()`

## Next Phase Readiness

- Wave 2 memory (03-04) + checkpointer (03-05) merge gate met
- Ready for 03-06 / remaining Phase 3 plans
- Phase 4: auth-bound thread_id + multi-replica

## Self-Check: PASSED

- FOUND: apps/agent-service/src/graph/build-graph.ts
- FOUND: apps/agent-service/src/main.ts
- FOUND: apps/web/lib/chat/thread-id.ts
- FOUND: tests/regression/phase-3/04-checkpointer-resume.test.ts
- FOUND: b5118bd, 808ddb6, 5a33c90
