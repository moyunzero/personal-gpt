---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: 企业级知识库平台
current_phase: 03
current_phase_name: rag-memory-eval
current_plan: 8
status: executing
stopped_at: Completed 03-04-PLAN.md
last_updated: "2026-08-21T16:17:45.342Z"
last_activity: 2026-08-21
last_activity_desc: Completed 03-04 Wave2a (Redis short-term + Mem0)
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 23
  completed_plans: 20
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-02)

**Core value:** 用户能上传企业文档、基于自有知识库获得可溯源的准确回答  
**Current focus:** Phase 3 — executing; next `03-05` (Wave 2b / multi-store or next incomplete plan)

## Current Position

Phase: PGPT-03 (rag-memory-eval) — **EXECUTING**  
Plan: 8 of 10
Current Plan: 8
Total Plans in Phase: 10  
Status: Ready to execute
Last activity: 2026-08-21 — Completed 03-04 Wave2a (Redis short-term + Mem0)

Progress: Phase 1–2 plans 12/12 complete; Phase 3 7/10 (through 03-04)

## Performance Metrics

**Velocity:**

- Total plans completed: 19（Phase 1: 7 · Phase 2: 5 · Phase 3: 7）
- Phase 2 closeout evidence: `tests/acceptance/phase-2-agent/CLOSEOUT.md`

**By Phase:**

| Phase | Plans | Status |
| --- | --- | --- |
| 1 (PGPT-01-rag) | 7/7 | Complete 2026-07-02 |
| 2 (PGPT-02-langgraph-agent) | 5/5 | MVP Complete 2026-08-14 |
| 3 | 7/10 | In progress |
| 4 | 0/3 | Not started |
| 5 | 0/1 | Not started |

**Plan durations (Phase 3):**

| Plan | Duration | Tasks | Files |
| --- | --- | --- | --- |
| 03-00 | 2min | 1 | 3 |
| 03-00b | 8min | 2 | 12 |
| 03-01 | 4min | 3 | 14 |
| 03-02 | 7min | 3 | 12 |
| 03-03 | 32min | 2 | 16 |
| Phase 03 P02 | 7min | 3 tasks | 12 files |
| Phase 03 P03 | 32min | 2 tasks | 16 files |
| Phase 03 P03b | 4min | 2 tasks | 6 files |
| Phase 03 P04 | 6min | 3 tasks | 16 files |

## Accumulated Context

### Decisions

- BullMQ + Redis 异步导入（见 PROJECT.md Key Decisions）
- workspaceId Day 1 全链路落库
- Phase 1 末搭 agent-service 透传骨架 → Phase 2 替换为真实 LangGraph SSE
- yarn workspaces monorepo，不引入 turborepo
- Citations emit post text-end via data-citations SSE part
- HyDE/Multi-Query default off; Reranker default ON (03-03 D-11)
- LangSmith fail-open tracing
- Phase 2: Chat/Agent 双模；方案 A 消息内嵌步骤；三 Skills；recursion/降级护栏
- Phase 2 stack: createSupervisor + @ai-sdk/langchain 2.x + MemorySaver；Skills≠Agent
- **v2.x:** Browser → `/api/agent/chat` BFF（非直连 :3002）；Sequential 流水线优先；可选 `AGENT_INTERNAL_TOKEN`
- **关账口径:** v2.0 = MVP 可演示，不是生产就绪（无鉴权多租户、无 agent Docker）
- [Phase 03]: v3.0 four Milestone-required waves (~5–8 weeks); Graph/Milvus not optional P2 (D-04 dual-write)
- [Phase 03]: D-06: 7 natural days then developer confirm before mock-as-closeout; never silent SC drop
- [Phase 03]: Phase 3 cites GOLDEN-01 (not Phase-3 EVAL-01); EVAL-01 remains Phase 5 RAGAS
- [Phase 03]: Wave 0b: rag-options.test ENABLE_RERANKER flip deferred to Wave 1 / plan 03-03
- [Phase 03]: migrate-corpus-split refuses --execute until plan 03-02 (T-03-00-01)
- [Phase 03]: ES BM25 + Astra vector + app-layer RRF; Compose ES only in Wave1 (D-08/D-14)
- [Phase 03]: hybridSearch default corpus=user; ES query fail-open vector-only (D-13); Corrective deferred to 03-03
- [Phase 03]: STORE-01/RAG-06 not marked complete yet — 03-01 is ES+hybrid skeleton only
- [Phase 03]: ingest dual-write Astra+ES fail-closed; createVectorStore corpus targeting; migrate --execute gated on USER/SEED
- [Phase 03]: ISSUE-001/CORPUS-01 not Closed until 03-03b; Chat corpus UI deferred to 03-03
- [Phase 03]: Corrective max 1 rewrite inside hybridSearch (D-32–D-34)
- [Phase 03]: ENABLE_RERANKER default ON; HyDE/MQ stay OFF (D-11/D-15)
- [Phase 03]: Chat/Agent retrieve thin wrappers over shared hybridSearch (D-12/D-29)
- [Phase 03]: corpus API+UI default user; explicit seed only (D-27/D-28)
- [Phase 03]: 03-03b: ISSUE-001 Closed after green regression 01/02 + migrate documented (D-31)
- [Phase 03]: 03-03b: GOLDEN-01 = golden.json≥20 + Vitest CI smoke; nightly LangSmith separate; not EVAL-01/RAGAS
- [Phase 03]: Short-term Redis FakeRedis unit tests; Mem0 prefs-only via addStableFacts (D-19)
- [Phase 03]: session-memory in shared for Chat+Agent; opaque localStorage userKey (D-18)

### Pending Todos

- Continue `/gsd-execute-phase 3` — next incomplete plan after 03-04 (03-05+)
- 执行中遵守书面降级协议 D-06（7 自然日 + 用户确认）
- Run `migrate-corpus-split --execute` in credentialed env when ready to cut over

### Blockers/Concerns

- **ISSUE-001** Closed（03-03b）：见 `docs/issues/ISSUE-001-mixed-corpus-recall.md`；credentialed `--execute` cutover still optional ops
- Phase 2 原 Success Criteria 中成功率/时延指标未做生产门禁（有意延期）

## Session Continuity

**Last session:** 2026-08-21T16:17:45.333Z
**Resume file:** None

**Stopped at:** Completed 03-04-PLAN.md

**Resume next:** execute next incomplete Phase 3 plan (`03-05`+)

Last session note: 2026-08-21 completed 03-04 Wave2a — Redis short-term + Mem0 long-term; 03-memory-recall green
