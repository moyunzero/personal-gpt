---
phase: 03-rag
plan: 01
subsystem: rag
tags: [elasticsearch, bm25, rrf, hybrid-search, corpus, STORE-01, RAG-06]

requires:
  - phase: 03-rag
    provides: 03-00 dual-write D-04 + 03-00b Nyquist stubs (rrf.test soft-skip)
provides:
  - Elasticsearch 8.17+IK Compose service (D-14)
  - App-layer reciprocalRankFusion with classic Σ 1/(k+rank)
  - corpus routing resolveCorpusTargets (user|seed → Astra + ES)
  - esBm25Search / ensureEsIndexes / indexChunks write helpers
  - hybridSearch shared entry with ES fail-open (D-12/D-13)
  - rerankDedicated HTTP + LLM fallback hook (Corrective deferred)
affects:
  - PGPT-03-rag 03-02 ingest dual-write
  - PGPT-03-rag 03-03 Chat/Agent call-site flip + Corrective
  - CORPUS-01 / ISSUE-001 migration

tech-stack:
  added:
    - "@elastic/elasticsearch@9.5.0"
    - "Elasticsearch 8.17.0 + IK 8.17.0 (Compose)"
  patterns:
    - "App-layer RRF (not concat-then-rerank)"
    - "ES query fail-open vector-only; ingest fail-closed deferred to 03-02"
    - "Default corpus=user (D-27); seed explicit"
    - "getVectorStoreForCorpus via resolveCorpusTargets collection name"

key-files:
  created:
    - docker/elasticsearch/Dockerfile
    - packages/shared/src/rag/corpus.ts
    - packages/shared/src/rag/rrf.ts
    - packages/shared/src/rag/es-client.ts
    - packages/shared/src/rag/es-bm25.ts
    - packages/shared/src/rag/hybrid-search.ts
    - packages/shared/src/rag/hybrid-search.test.ts
    - packages/shared/src/rag/rerank.ts
  modified:
    - docker-compose.yml
    - packages/shared/package.json
    - packages/shared/src/schemas/env.ts
    - packages/shared/src/index.ts
    - packages/shared/src/rag/rrf.test.ts
    - .env.example
    - yarn.lock

key-decisions:
  - "ES BM25 + Astra vector + app-layer RRF (D-08); no Kibana/Milvus/Neo4j in Wave1 Compose"
  - "hybridSearch default corpus=user; ES errors fail-open vector-only (D-13)"
  - "Corrective / Chat retrieve.ts flip deferred to 03-03"
  - "STORE-01/RAG-06 marked progress only — ES+hybrid skeleton; Milvus/Neo4j/Graph later"

patterns-established:
  - "packages/shared/src/rag/* is the single hybrid entry for Chat+Agent"
  - "HybridSearchDeps injectable for unit fail-open tests without live ES"
  - "ES index settings use ik_smart analyzer; structured client queries only"

requirements-completed: []  # STORE-01 / RAG-06 foundation shipped; full REQ closeout needs later plans

coverage:
  - id: D1
    description: docker compose lists elasticsearch service (8.17+IK Dockerfile)
    requirement: STORE-01
    verification:
      - kind: other
        ref: "docker compose config --services | rg elasticsearch"
        status: pass
    human_judgment: false
  - id: D2
    description: reciprocalRankFusion classic RRF scores on two-list fixture
    requirement: RAG-06
    verification:
      - kind: unit
        ref: "packages/shared/src/rag/rrf.test.ts#fuses two ranked lists with classic RRF scores"
        status: pass
    human_judgment: false
  - id: D3
    description: hybridSearch ES throw → fail-open vector-only (resolves, no reject)
    requirement: RAG-06
    verification:
      - kind: unit
        ref: "packages/shared/src/rag/hybrid-search.test.ts#fail-opens to vector-only when ES throws"
        status: pass
    human_judgment: false
  - id: D4
    description: hybridSearch / RRF / corpus helpers exported from @personal-gpt/shared
    requirement: RAG-06
    verification:
      - kind: unit
        ref: "yarn workspace @personal-gpt/shared exec tsc --noEmit"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-21
status: complete
---

# Phase 03 Plan 01: ES + hybrid RRF foundation Summary

**Compose Elasticsearch 8.17+IK plus packages/shared hybridSearch with classic app-layer RRF, corpus routing, BM25 client, and ES fail-open**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-21T14:55:14Z
- **Completed:** 2026-08-21T14:58:53Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Root Compose adds `elasticsearch` (single-node, 512m heap, healthcheck, `es_data`); Dockerfile pins ES 8.17.0 + IK 8.17.0
- `@elastic/elasticsearch@9.5.0` on `@personal-gpt/shared`; env schema + `.env.example` for ES/corpus/RRF/rerank
- True `reciprocalRankFusion` (Σ 1/(k+rank)) with green unit tests; `resolveCorpusTargets` maps user/seed distinctly
- `hybridSearch` shared entry: parallel vector ∥ BM25 → RRF → optional `rerankDedicated`; ES errors fail-open; Corrective not wired

## Task Commits

Each task was committed atomically:

1. **Task 1: Elasticsearch Compose + env schema (D-14)** - `da317e0` (feat)
2. **Task 2: corpus + RRF + ES BM25 modules** - `9f8bfa4` (feat)
3. **Task 3: hybridSearch entry + dedicated rerank hook** - `70a8d0c` (feat)

**Plan metadata:** (docs commit after this SUMMARY)

## Files Created/Modified

- `docker/elasticsearch/Dockerfile` - ES 8.17.0 + IK plugin
- `docker-compose.yml` - elasticsearch service + es_data volume
- `packages/shared/src/rag/corpus.ts` - Corpus targets resolver
- `packages/shared/src/rag/rrf.ts` - Classic RRF
- `packages/shared/src/rag/es-client.ts` - ES client singleton
- `packages/shared/src/rag/es-bm25.ts` - ensure/index/delete/search BM25
- `packages/shared/src/rag/hybrid-search.ts` - public hybridSearch + getVectorStoreForCorpus
- `packages/shared/src/rag/hybrid-search.test.ts` - D-13 fail-open proof
- `packages/shared/src/rag/rerank.ts` - dedicated HTTP + LLM fallback
- `packages/shared/src/rag/rrf.test.ts` - real RRF assertions (replaced Nyquist stub)
- `packages/shared/src/schemas/env.ts` / `.env.example` - ES_NODE, corpus collections/indexes, RRF_K, RERANK_*
- `packages/shared/src/index.ts` - exports hybrid/RRF/corpus/es/rerank

## Decisions Made

- Followed CONTEXT D-08/D-12/D-13/D-14: app-layer RRF, shared entry, ES fail-open on query, Compose ES only (no Kibana/Milvus/Neo4j)
- Default `corpus=user` (D-27); seed requires explicit param
- Corrective loop and Chat/Agent retrieve flip deferred to plan 03-03
- Did not mark STORE-01 / RAG-06 complete in REQUIREMENTS.md — this plan is ES+hybrid skeleton only

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `docker` not on default PATH in executor shell; verified via `/usr/local/bin/docker compose config --services`

## User Setup Required

None for code merge. Local ES: `docker compose up -d elasticsearch` (first build pulls ES+IK image). Optional: set `ASTRA_DB_COLLECTION_USER/SEED`, `ES_INDEX_*`, `RERANK_*` per `.env.example`.

## Next Phase Readiness

- Ready for **03-02** ingest dual-write (Astra + ES; write fail-closed)
- Ready for **03-03** to switch Chat/Agent to `hybridSearch` and add Corrective
- `rrf.test.ts` Nyquist stub replaced with real assertions; `corrective.test.ts` still soft-skips until 03-03

## Self-Check: PASSED

- Files: Dockerfile, hybrid-search.ts, rrf.ts, es-bm25.ts, corpus.ts, rerank.ts, tests — FOUND
- Commits: da317e0, 9f8bfa4, 70a8d0c — FOUND
- Verify: rrf + hybrid-search vitest pass; shared `tsc --noEmit` pass; compose lists elasticsearch

---
*Phase: 03-rag*
*Completed: 2026-08-21*
