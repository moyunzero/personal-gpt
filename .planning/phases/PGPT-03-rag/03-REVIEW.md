---
phase: PGPT-03-rag
reviewed: 2026-08-21T17:03:48Z
depth: standard
files_reviewed: 42
files_reviewed_list:
  - packages/shared/src/rag/hybrid-search.ts
  - packages/shared/src/rag/rrf.ts
  - packages/shared/src/rag/corrective.ts
  - packages/shared/src/rag/rerank.ts
  - packages/shared/src/rag/es-bm25.ts
  - packages/shared/src/rag/es-client.ts
  - packages/shared/src/rag/corpus.ts
  - packages/shared/src/rag/graph-rag.ts
  - packages/shared/src/rag/graph-cypher-allowlist.ts
  - packages/shared/src/memory/short-term-redis.ts
  - packages/shared/src/memory/mem0-client.ts
  - packages/shared/src/memory/session-memory.ts
  - packages/shared/src/stores/vector-store.ts
  - packages/shared/src/stores/vector-store.factory.ts
  - packages/shared/src/stores/vector-store.astra.ts
  - packages/shared/src/stores/vector-store.milvus.ts
  - packages/shared/src/schemas/env.ts
  - packages/shared/src/index.ts
  - apps/web/lib/chat/retrieve.ts
  - apps/web/lib/chat/rag-options.ts
  - apps/web/lib/chat/corpus-filters.ts
  - apps/web/lib/chat/memory-context.ts
  - apps/web/lib/chat/user-key.ts
  - apps/web/lib/chat/thread-id.ts
  - apps/web/lib/chat/stream.ts
  - apps/web/app/api/chat/route.ts
  - apps/web/app/components/CorpusToggle.tsx
  - apps/web/lib/kb/documents.service.ts
  - apps/agent-service/src/rag/retrieve.ts
  - apps/agent-service/src/tools/graph-search.tool.ts
  - apps/agent-service/src/agents/retriever.agent.ts
  - apps/agent-service/src/agents/caps.ts
  - apps/agent-service/src/graph/build-graph.ts
  - apps/agent-service/src/main.ts
  - apps/ingest-worker/src/ingest/pipeline/upsert.ts
  - apps/ingest-worker/src/ingest/pipeline/es-upsert.ts
  - apps/ingest-worker/src/ingest/pipeline/delete.ts
  - apps/ingest-worker/src/ingest/ingest.processor.ts
  - script/migrate-corpus-split.ts
  - docker-compose.yml
  - .env.example
  - packages/shared/src/rag/rrf.test.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase PGPT-03: Code Review Report

**Reviewed:** 2026-08-21T17:03:48Z
**Depth:** standard
**Files Reviewed:** 42
**Status:** issues_found

## Summary

Reviewed Phase 3 RAG production sources (hybrid RRF, Corrective, ES dual-write, corpus routing, Mem0/Redis memory, Milvus factory, Neo4j Graph RAG, Chat/Agent wire-up, ingest delete/upsert). Graph MCP servers were unavailable; review used direct file reads and git diff from `612da5c`.

Two **critical** correctness/isolation defects: (1) post-RRF score scale is incompatible with Chat/Agent/Corrective cosine-style thresholds, so retrieval can silently become “no hits” unless dedicated HTTP rerank rewrites scores; (2) document delete paths still hardcode Astra and skip Milvus, leaving orphan vectors when `VECTOR_BACKEND=milvus`. Additional warnings around client-controlled memory keys, incomplete Cypher structural allowlisting, and HyDE×BM25 coupling.

## Critical Issues

### CR-01: RRF similarity scale breaks Chat TOP1, Corrective, and Agent minSimilarity gates

**File:** `packages/shared/src/rag/rrf.ts:31-33`
**Also:** `apps/web/lib/chat/retrieve.ts:46-48`, `apps/web/lib/chat/rag-options.ts:36`, `packages/shared/src/rag/corrective.ts:11-26`, `apps/agent-service/src/rag/retrieve.ts:20-33,99`

**Issue:** `reciprocalRankFusion` overwrites `similarity` with classic RRF scores (`1/(k+rank)`, typically ~0.016–0.03 for `k=60`). Downstream gates still treat `similarity` as cosine/relevance in `[0,1]`:

- Chat `TOP1_SIMILARITY_THRESHOLD = 0.55` → `passesTop1PreCheck` fails → `{ kind: "no-docs" }` for almost all hybrid results when dedicated rerank does not replace scores.
- Corrective default `CORRECTIVE_MIN_SCORE = 0.35` → `needsCorrectiveRewrite` is nearly always true on RRF output (extra rewrite every query).
- Agent `DEFAULT_KB_MIN_SIMILARITY = 0.6` → `retrieveKb` filters out all RRF-scored chunks.

LLM rerank fallback (`rerank.ts`) reorders hits but **does not** rescale `similarity`. Dedicated HTTP rerank only helps when `RERANK_URL` + `RERANK_API_KEY` are set and return `relevance_score`. Regression tests already work around this by setting `CORRECTIVE_MIN_SCORE=0`, which confirms the scale mismatch is known but unfixed in production defaults.

**Fix:** Keep original vector similarity (or a normalized fused score) for gating, and use RRF only for ranking; or normalize RRF to `[0,1]` before thresholds; or switch Chat/Agent/Corrective thresholds to RRF-aware values and document the unit. Prefer preserving pre-RRF top1 cosine for gates:

```typescript
// After RRF sort, attach gateScore from best original vector similarity
// or map: similarity = rrfScore / (2 / (k+1))  // normalize dual-list max ≈ 1
```

Also ensure LLM rerank path updates `similarity` (or a separate `gateScore`) when dedicated rerank is absent.

### CR-02: Document delete does not remove Milvus vectors

**File:** `apps/ingest-worker/src/ingest/pipeline/delete.ts:9-16`
**Also:** `apps/web/lib/kb/documents.service.ts:331-338`

**Issue:** Upsert dual-writes via `shouldWriteAstra` / `shouldWriteMilvus` (`upsert.ts`), but delete always uses `createAstraVectorStore` / `createVectorStore` (Astra only) plus ES. When `VECTOR_BACKEND=milvus` (or dual-write), deleted documents leave vectors in Milvus → stale recall and tenant data retention after “delete”.

**Fix:** Mirror upsert backend selection:

```typescript
export async function deleteDocument(
  workspaceId: string,
  documentId: string,
  corpus: Corpus = "user",
): Promise<void> {
  if (shouldWriteAstra()) {
    await createAstraVectorStore({ corpus }).deleteByDocument(workspaceId, documentId);
  }
  if (shouldWriteMilvus()) {
    await createMilvusVectorStore({ corpus }).deleteByDocument(workspaceId, documentId);
  }
  await deleteDocumentFromEs(workspaceId, documentId, corpus);
}
```

Apply the same pattern in `documents.service.ts` `deleteDocument`.

## Warnings

### WR-01: Memory scope keyed by client-supplied `userKey` without authentication

**File:** `apps/web/app/api/chat/route.ts:134-142,200-218`
**Also:** `packages/shared/src/memory/session-memory.ts:27-38`, `apps/web/lib/chat/user-key.ts:19-31`

**Issue:** Short-term Redis and Mem0 scopes are `workspaceId:userKey`. `userKey` is accepted from the request body / localStorage with no server binding. Any client that learns or guesses another opaque key under the shared `DEFAULT_WORKSPACE_ID` can load/persist that user’s memory. Acceptable only as explicit pre-auth MVP; still a privacy gap for anything beyond single-operator local use.

**Fix:** Until Phase 4 auth: derive server-side key from signed cookie/session, or require `INTERNAL_PROXY_KEY` / session for memory read/write; reject cross-origin memory when proxy trust is absent. Document that memory is not multi-user-safe.

### WR-02: Cypher allowlist does not enforce exported label/rel allowlists

**File:** `packages/shared/src/rag/graph-cypher-allowlist.ts:9-43`

**Issue:** `ALLOWED_REL_TYPES` / `ALLOWED_LABELS` are exported but never checked. Guard only rejects write/admin keywords and requires `MATCH`+`RETURN`. Current `graphRagQuery` hardcodes `MILK_TEA_PATH_CYPHER` (params only), so risk is limited today; any future caller that passes dynamic Cypher through `assertAllowlistedCypher` gets a weaker guarantee than the comments imply (e.g. `MATCH (n) RETURN n` / broad reads).

**Fix:** Assert only known labels/rel types appear, or replace string allowlisting with a fixed query registry (no free-form Cypher). Prefer registry given the narrow milk-tea subgraph.

### WR-03: HyDE replaces the BM25 query string when enabled

**File:** `apps/web/lib/chat/retrieve.ts:184-195`

**Issue:** When `ENABLE_HYDE=true`, `embeddingInput` (hypothetical answer) is passed as `hybridSearch` `query`, so **both** vector embed and ES BM25 run on the HyDE paragraph. That undermines Phase 3’s BM25 proper-noun advantage (ISSUE-001 / hybrid path). Default is off, but enabling HyDE regresses hybrid quality.

**Fix:** Pass original `searchQuery` to hybrid/ES and use HyDE only for the embedding channel (split deps: `embed(hydeText)` vs `esSearch({ query: userQuery })`).

### WR-04: Short-term Redis updates are non-atomic read-modify-write

**File:** `packages/shared/src/memory/short-term-redis.ts:74-111`

**Issue:** `appendTurn` / `maybeUpdateSummary` do `GET` → mutate → `SET` without WATCH/MULTI or Lua. Concurrent Chat+Agent turns for the same key can drop turns or clobber summary.

**Fix:** Use a Lua script or Redis `MULTI`/`WATCH`, or store turns in a capped Redis list (`LPUSH`/`LTRIM`) with summary in a separate key.

## Info

### IN-01: `extractStableFactsFromUserText` stores the full user utterance

**File:** `packages/shared/src/memory/mem0-client.ts:170-176`

**Issue:** On pattern match, `facts.push(text)` pushes the entire message, not `m[1]`. Mem0 may store more conversational noise than the D-19 “stable fact” intent.

**Fix:** Prefer `facts.push(m[1].trim())` (or a normalized sentence built from the capture).

### IN-02: Neo4j driver falls back to compose default password in code

**File:** `packages/shared/src/rag/graph-rag.ts:197-200`

**Issue:** `NEO4J_PASSWORD` defaults to `personal_gpt_neo4j` in library code. Fine for local Compose; risky if the module is pointed at a remote Neo4j without env override.

**Fix:** Require explicit `NEO4J_PASSWORD` outside development (`NODE_ENV === "production"` fail-fast), matching `AGENT_INTERNAL_TOKEN` bootstrap pattern.

### IN-03: `maybeCorrective` `alreadyCorrected` is unused by `hybridSearch`

**File:** `packages/shared/src/rag/corrective.ts:44-56`
**Also:** `packages/shared/src/rag/hybrid-search.ts:100-108`

**Issue:** Second pass uses `skipCorrective: true` and never enters `maybeCorrective`, so `alreadyCorrected` is dead API surface. Harmless but confusing for maintainers.

**Fix:** Remove `alreadyCorrected` or wire it consistently; keep a single “corrected once” mechanism.

---

_Reviewed: 2026-08-21T17:03:48Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
