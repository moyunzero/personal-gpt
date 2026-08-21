---
phase: 03-rag
plan: 06
subsystem: storage
tags: [milvus, vector-store, docker-compose, workspace-isolation, VECTOR_BACKEND]

requires:
  - phase: 03-05
    provides: PostgresSaver checkpointer + prior VectorStore/Astra patterns
  - phase: 03-01
    provides: VectorStore interface + Astra impl + workspaceId asserts
provides:
  - Milvus VectorStore behind same VectorStore interface
  - VECTOR_BACKEND=astra|milvus factory (default astra)
  - Compose milvus (+ etcd/minio); 05 workspace isolation regression green
affects: [03-07-graph, hybrid-search, ingest-worker]

tech-stack:
  added: ["@zilliz/milvus2-sdk-node@3.0.4"]
  patterns:
    - "VECTOR_BACKEND factory selects Astra or Milvus; hybridSearch uses createVectorStoreFromEnv"
    - "Ingest writes Milvus only when VECTOR_BACKEND=milvus or MILVUS_DUAL_WRITE=true"

key-files:
  created:
    - packages/shared/src/stores/vector-store.milvus.ts
    - packages/shared/src/stores/vector-store.factory.ts
  modified:
    - docker-compose.yml
    - packages/shared/package.json
    - packages/shared/src/stores/vector-store.ts
    - packages/shared/src/schemas/env.ts
    - packages/shared/src/rag/hybrid-search.ts
    - packages/shared/src/index.ts
    - apps/ingest-worker/src/ingest/pipeline/upsert.ts
    - tests/regression/phase-3/05-workspace-isolation.test.ts
    - .env.example

key-decisions:
  - "Default VECTOR_BACKEND remains astra; Milvus opt-in via env"
  - "No dual vector write on Astra default; MILVUS_DUAL_WRITE optional"
  - "Milvus collection names align with corpus Astra names unless MILVUS_COLLECTION_* set"
  - "Compose service named milvus (plus milvus-etcd / milvus-minio deps)"

patterns-established:
  - "Injectable MilvusClientLike + skipEnsure for unit tests without live Milvus"
  - "workspaceId filter mandatory on Milvus search (assertSearchWorkspaceId)"

requirements-completed: [STORE-01]

coverage:
  - id: D1
    description: Milvus VectorStore upsert/delete/search with mandatory workspaceId
    requirement: STORE-01
    verification:
      - kind: unit
        ref: "tests/regression/phase-3/05-workspace-isolation.test.ts#Milvus search throws without workspaceId"
        status: pass
    human_judgment: false
  - id: D2
    description: VECTOR_BACKEND factory defaults to Astra and switches to Milvus
    requirement: STORE-01
    verification:
      - kind: unit
        ref: "tests/regression/phase-3/05-workspace-isolation.test.ts#factory defaults to astra"
        status: pass
    human_judgment: false
  - id: D3
    description: Workspace A/B same-title docs never cross in search
    requirement: STORE-01
    verification:
      - kind: unit
        ref: "tests/regression/phase-3/05-workspace-isolation.test.ts#returns zero cross-workspace hits"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-08-21
status: complete
---

# Phase 03 Plan 06: Milvus VectorStore + Compose Summary

**Milvus VectorStore behind `VECTOR_BACKEND` factory (Astra default) with Compose stack and green workspace A/B isolation regression.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-21T16:22:17Z
- **Completed:** 2026-08-21T16:28:00Z
- **Tasks:** 3/3
- **Files modified:** 11

## Accomplishments

- Implemented `createMilvusVectorStore` with upsert/delete/search and mandatory `workspaceId` (reuse Astra asserts)
- Added Compose `milvus` (+ etcd/minio); env `VECTOR_BACKEND`, `MILVUS_ADDRESS`, collection overrides
- Factory + hybridSearch + ingest switch; regression `05-workspace-isolation` green (4 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Milvus VectorStore impl + Compose (STORE-01)** - `86ad765` (feat)
2. **Task 2: VECTOR_BACKEND factory + optional ingest path** - `ebef082` (feat)
3. **Task 3: Green 05 workspace isolation regression** - `2c6b573` (test)

**Plan metadata:** `f98f662` (docs: complete plan)

## Files Created/Modified

- `packages/shared/src/stores/vector-store.milvus.ts` — Milvus VectorStore impl
- `packages/shared/src/stores/vector-store.factory.ts` — `createVectorStoreFromEnv` / write flags
- `packages/shared/src/stores/vector-store.ts` — re-exports milvus + factory
- `packages/shared/src/rag/hybrid-search.ts` — `getVectorStoreForCorpus` uses factory
- `apps/ingest-worker/src/ingest/pipeline/upsert.ts` — conditional Astra/Milvus write + ES
- `docker-compose.yml` — milvus / milvus-etcd / milvus-minio
- `packages/shared/src/schemas/env.ts` / `.env.example` — VECTOR_BACKEND / MILVUS_*
- `tests/regression/phase-3/05-workspace-isolation.test.ts` — isolation + factory coverage

## Decisions Made

- Astra remains default; Milvus is opt-in via `VECTOR_BACKEND=milvus`
- Dual vector write only when `MILVUS_DUAL_WRITE=true` (ES dual-write unchanged)
- Collection naming falls back to corpus Astra collection names for alignment

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

None — surfaces covered by plan threat model (T-03-ws, T-03-06-01, T-03-SC).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: packages/shared/src/stores/vector-store.milvus.ts
- FOUND: packages/shared/src/stores/vector-store.factory.ts
- FOUND: tests/regression/phase-3/05-workspace-isolation.test.ts
- FOUND: docker-compose.yml
- FOUND commits: 86ad765, ebef082, 2c6b573
