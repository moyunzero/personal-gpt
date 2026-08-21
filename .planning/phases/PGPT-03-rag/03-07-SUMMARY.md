---
phase: 03-rag
plan: 07
subsystem: rag
tags: [neo4j, neo4j-driver, graph-rag, cypher-allowlist, graph-search, milestone]

requires:
  - phase: 03-rag
    provides: Milvus VectorStore + hybrid/corrective pipeline + phase-3 regression harness
provides:
  - Neo4j Compose service + NEO4J_* env
  - Allowlisted Cypher Graph RAG (milk-tea seed subgraph)
  - Agent graph_search tool (no Graph/Corrective sub-agent)
  - Green 06-graph-path regression
  - D-02 full-union milestone checklist
affects: [phase-4-prod, verifier, milestone-closeout]

tech-stack:
  added: [neo4j-driver@6.2.0, neo4j:5.26-community]
  patterns:
    - "Graph access only via neo4j-driver read sessions + Cypher allowlist (no @langchain/community Neo4j)"
    - "Narrow seeded subgraph (A5) — not full-KB auto-extract"
    - "Entity-relation retrieval as Agent tool, not a new LangGraph sub-agent (D-32/D-35)"

key-files:
  created:
    - packages/shared/src/rag/graph-cypher-allowlist.ts
    - packages/shared/src/rag/graph-cypher-allowlist.test.ts
    - packages/shared/src/rag/graph-rag.ts
    - apps/agent-service/src/tools/graph-search.tool.ts
    - apps/agent-service/src/tools/graph-search.tool.test.ts
    - apps/agent-service/skills/graph-retrieval/SKILL.md
  modified:
    - docker-compose.yml
    - packages/shared/package.json
    - packages/shared/src/index.ts
    - packages/shared/src/schemas/env.ts
    - .env.example
    - apps/agent-service/src/agents/retriever.agent.ts
    - apps/agent-service/src/agents/caps.ts
    - tests/regression/phase-3/06-graph-path.test.ts
    - .planning/ROADMAP.md
    - docs/enterprise-roadmap.md

key-decisions:
  - "Pin neo4j-driver@6.2.0; ban @langchain/community Neo4j bindings"
  - "Cypher allowlist rejects CREATE/MERGE/DELETE/DROP/SET/CALL writes"
  - "Milk-tea seeded subgraph for demonstrable path traces (A5)"
  - "graph_search on Retriever only — no Corrective/Graph sub-agent"

patterns-established:
  - "Pattern: inject GraphQueryExecutor for fixture tests without live Neo4j"
  - "Pattern: return node ids + relationship types for citation/trace"

requirements-completed: [RAG-06, STORE-01]

coverage:
  - id: D1
    description: Neo4j Compose + neo4j-driver + allowlisted graphRagQuery
    requirement: STORE-01
    verification:
      - kind: unit
        ref: packages/shared/src/rag/graph-cypher-allowlist.test.ts#rejects destructive Cypher
        status: pass
      - kind: other
        ref: docker compose config --services | rg neo4j
        status: pass
    human_judgment: false
  - id: D2
    description: Agent graph_search tool backed by shared Graph RAG
    requirement: RAG-06
    verification:
      - kind: unit
        ref: apps/agent-service/src/tools/graph-search.tool.test.ts#exposes graph_search
        status: pass
    human_judgment: false
  - id: D3
    description: 06-graph-path regression returns traceable path; phase-3 suite green
    requirement: RAG-06
    verification:
      - kind: integration
        ref: tests/regression/phase-3/06-graph-path.test.ts#returns a traceable Neo4j path
        status: pass
      - kind: other
        ref: yarn test:regression:phase-3
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-08-21
status: complete
---

# Phase 03 Plan 07: Neo4j Graph RAG + Milestone Closeout Summary

**Narrow Graph RAG via neo4j-driver + Cypher allowlist, graph_search Agent tool, green 06-graph-path, and D-02 full-union checklist**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-21T16:46:22Z
- **Completed:** 2026-08-21T16:56:28Z
- **Tasks:** 3/3
- **Files modified:** ~15

## Accomplishments

- Added Neo4j to Compose and pinned `neo4j-driver@6.2.0` (no community Neo4j package)
- Implemented allowlisted `graphRagQuery` over a milk-tea seed subgraph with fixture executor for tests
- Wired Retriever `graph_search` tool (D-32/D-35: tool only, no new Graph sub-agent)
- Greened `06-graph-path` and full `tests/regression/phase-3` (01–06)
- Marked ROADMAP Phase 3 plans 10/10; enterprise-roadmap Wave4 Graph note

## Task Commits

Each task was committed atomically:

1. **Task 1: Neo4j Compose + driver + allowlisted GraphRAG** - `29dd5a9` (feat)
2. **Task 2: Wire Agent graph_search tool** - `cdcb5bb` (feat)
3. **Task 3: Green 06-graph-path + Milestone checklist** - `d8008bc` (test)

**Plan metadata:**  (docs: complete plan)

## Files Created/Modified

- `packages/shared/src/rag/graph-cypher-allowlist.ts` — Cypher allowlist (MATCH/RETURN only)
- `packages/shared/src/rag/graph-rag.ts` — narrow Graph RAG entry + seed/fixture
- `apps/agent-service/src/tools/graph-search.tool.ts` — Agent tool → shared graphRagQuery
- `tests/regression/phase-3/06-graph-path.test.ts` — path node/rel assertions
- `docker-compose.yml` — neo4j service
- `.planning/ROADMAP.md` / `docs/enterprise-roadmap.md` — Wave4 + plan checkboxes

## Decisions Made

- Graph Cypher is template + allowlist only (no free-form LLM Cypher in prod path)
- Fixture executor keeps CI green without requiring live Neo4j
- Optional `graph-retrieval` skill; default ENABLED_SKILLS unchanged (3 skills)

## D-02 Full-Union Milestone Checklist

| Item | Status |
|------|--------|
| Hybrid search (ES BM25 + vector RRF) | ✅ |
| Rerank default on | ✅ |
| Corrective | ✅ |
| Golden set smoke | ✅ |
| ISSUE-001 corpus split | ✅ |
| Redis short-term memory | ✅ |
| Mem0 long-term memory | ✅ |
| Elasticsearch | ✅ |
| Milvus VectorStore | ✅ |
| Neo4j Graph RAG | ✅ (this plan) |
| Postgres checkpointer | ✅ |
| Chat/Agent shared hybrid entry | ✅ |
| `tests/regression/phase-3` 01–06 green | ✅ |

**Not claimed:** Phase 4 auth / production multi-tenant (correctly deferred).

## Deviations from Plan

None - plan executed as written.

### Auto-fixed Issues

None.

## Issues Encountered

- Docker CLI not on default PATH in agent shell; verified Compose neo4j via `/usr/local/bin/docker compose config`.

## User Setup Required

Optional local Neo4j (Compose):

```bash
docker compose up -d neo4j
# .env: NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=personal_gpt_neo4j
```

Regression/path tests use in-memory fixture and do not require a live Neo4j.

## Next Phase Readiness

- Phase 3 plans 10/10 — ready for verifier / milestone summary
- Phase 4 (auth, compose prod stack, observability) remains next

## Self-Check: PASSED

- FOUND: graph-rag.ts, graph-cypher-allowlist.ts, graph-search.tool.ts, 06-graph-path.test.ts
- FOUND commits: `29dd5a9`, `cdcb5bb`, `d8008bc`

---
*Phase: 03-rag*
*Completed: 2026-08-21*
