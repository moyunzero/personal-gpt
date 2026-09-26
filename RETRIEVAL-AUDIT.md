# Retrieval / RAG / Routing Subsystem Audit

Scope: `packages/shared/src/{rag,routing,graph,ai}`, `apps/web/lib/chat/*`, `apps/agent-service/src/rag/*`
(+ the store layer the RAG code actually calls: `packages/shared/src/stores/*`).
All 254 scoped tests pass (49 files). Verdict at the end.

---

## 1. Actual retrieval architecture

### 1.1 The spine: `hybridSearch`

One entry point, `packages/shared/src/rag/hybrid-search.ts:113`. Per call:

1. `embedText(embedQuery ?? query)` — dense query vector (`hybrid-search.ts:76-77`).
2. Vector search and BM25 search fired in parallel (`hybrid-search.ts:79-97`), candidate limit
   `min(max(limit*2, limit), 50)` (`hybrid-search.ts:36-38`).
3. ES failure is caught and returns `[]` → vector-only (`hybrid-search.ts:92-95`).
4. `reciprocalRankFusion([esHits, vectorHits])` (`hybrid-search.ts:99`).
5. Document-ID ACL trim (`hybrid-search.ts:49-54`, `hybrid-search.ts:100`), fail-closed on `[]`.
6. Dedicated reranker unless `ENABLE_RERANKER === "false"` (`hybrid-search.ts:45-47`, `102-104`).
7. Rule-based Corrective: one rewrite + one re-search if top-1 cosine < threshold
   (`hybrid-search.ts:127-131` → `corrective.ts:51`).

This is a **real** hybrid pipeline, not a stub. Same function is shared by web Chat
(`apps/web/lib/chat/retrieve.ts:188`) and the Agent (`apps/agent-service/src/rag/retrieve.ts:89`).

### 1.2 Dense store — real, two backends + relay

`VectorStore` interface `stores/vector-store.ts:45-49`; factory keyed on `VECTOR_BACKEND`
(`stores/vector-store.factory.ts:13-42`).

- **Astra** (`stores/vector-store.astra.ts:69`): `DataAPIClient` + `sort: {$vector}` +
  `includeSimilarity` (`:156-170`), workspace filter `$and`-merged with optional corpus filter
  (`:172-181`), delete-then-insert for idempotent re-index (`:110-115`) with rollback on partial
  failure (`:133-141`).
- **Milvus** (`stores/vector-store.milvus.ts:93`): collection + IVF_FLAT/COSINE index bootstrap
  (`:118-144`), single-flight `ensurePromise` guard (`:104-153`), filter-string escaping
  (`:46-48`), tail-chunk delete on shrink (`:186-190`).
- Astra→Redis relay fallback (`vector-store.astra-relay.ts`, `astra.ts:73-78`).

Real algorithms. Note the two backends **do not agree on similarity semantics**: Astra passes
through `$similarity` (`astra.ts:59`), Milvus remaps cosine `[-1,1] → [0,1]` via `(s+1)/2`
(`milvus.ts:69-74`). Every downstream threshold (`0.55`/`0.68`/`0.42`/`0.35`/`0.6`) is therefore
backend-dependent.

### 1.3 BM25 / Elasticsearch — real implementation, structurally unreachable read path

- Index with IK analyzer for Chinese (`es-bm25.ts:26-48`), `multi_match` with `title^2` and
  explicit `analyzer: "ik_smart"` (`es-bm25.ts:153-161`), bulk dual-write with error accounting
  (`es-bm25.ts:71-94`).
- **However** `es-client.ts:9-11` documents that production/Vercel normally has no ES, and
  `isEsConfigured()` gates _writes_ only (`apps/ingest-worker/src/ingest/pipeline/upsert.ts:36-38`,
  `apps/web/lib/kb/documents.service.ts:512-514`).
- The **read** path never checks it: `hybridSearchOnce` always calls `esSearch`
  (`hybrid-search.ts:86`), and `getEsClient()` silently defaults to `http://localhost:9200`
  (`es-client.ts:16`). In production every single retrieval issues a doomed
  connect to localhost:9200 and pays the failure latency before failing open.

### 1.4 RRF — real, textbook

`rrf.ts:7-48`: `Σ 1/(k + rank)` keyed by `documentId:chunkIndex`, `k` from `RRF_K` default 60,
payload merge prefers the vector-list chunk so `similarity` stays cosine-scale
(`rrf.ts:27-41`). The header comment (`rrf.ts:5`) explicitly rejects concat-then-rerank — the
test enforces that (`rrf.test.ts:19-56`).

### 1.5 Reranking — real HTTP reranker + LLM fallback

`rerank.ts:17-63`: OpenRouter/Cohere-compatible `POST` with `AbortSignal.timeout(8_000)`
(`rerank.ts:45`), index-mapped and de-duplicated results (`:69-88`), then an LLM listwise
fallback gated behind `RERANK_LLM_FALLBACK === "true"` (`:59-67`, default **off**), falling back
to cosine sort on any failure (`:128-130`). This is genuine.

### 1.6 Corrective RAG — real but minimal

`corrective.ts:13-27`: threshold from `CORRECTIVE_MIN_SCORE` (default 0.35), triggers on
`hits.length === 0` **or** top-1 `<` threshold. One rewrite via `generateRagHelperText`
(`:29-37`), re-search guarded by `skipCorrective` (`hybrid-search.ts:129-130`), and every
failure path returns the original hits (`corrective.ts:65-68`, `:77-79`). One iteration only —
no grading, no multi-hop.

### 1.7 Graph RAG — real Cypher + real allowlist, but hard-gated

- Templates `graph-cypher-templates.ts:20-63`, template choice by entity source (`:65-76`).
- Real `neo4j-driver` read session with timeouts and `executeRead`
  (`graph-rag.ts:273-293`), driver singleton (`:242-264`).
- Path mapping including the single-node no-segment case (`graph-rag.ts:77-131`).
- **Allowlist is substantive**: comment stripping, write-keyword blocklist, must-start-with-MATCH,
  must-have-RETURN, single-statement, label allowlist, relationship-type allowlist, bounded
  var-length `*n..m` with `MAX_ALLOWED_VAR_LENGTH_HOPS = 2`
  (`graph-cypher-allowlist.ts:6-7, 79-175`).

Gating problem (see §5): the Chat caller only ever runs graph RAG when `corpus === "seed"`
(`apps/web/app/api/chat/route.ts:277`).

### 1.8 Query expansion — present, off by default

HyDE and multi-query are implemented for real (`apps/web/lib/chat/retrieve.ts:50-82`) but
`ENABLE_HYDE`/`ENABLE_MULTI_QUERY` default to `false` (`rag-options.ts:14-15`), so they are dead
code on a default deployment. Multi-query would also multiply cost 4× (1 + 3 variants, each a
full hybrid search at `retrieve.ts:185-201`).

---

## 2. Routing tiering: L0/L1/L2 — genuine, with real fallbacks

Not a placeholder; but the _effective_ decision is dominated by one embedding probe.

- **L0** (`routing/l0-rules.ts`): chitchat/empty/pure-math short-circuit (`l0-rules.ts:181-213`),
  graph-relation lexicon + entity resolution (`:63-85`), multi-step specialist ordering by keyword
  position with a tie-break order (`:106-143`), and matcher precedence chitchat → multi_step →
  graph (`:216-227`). Real, deterministic.
- **L1** (`routing/l1-signals.ts:22-63`): optional embedding probe → three bands
  `kbHigh` (≥ `routeRetrieveSimilarity`, default 0.68), `kbLow` (< `routeDirectSimilarity`,
  default 0.42), `kbGray` between. Probe failure and `!kb.probed` both fail open to
  "unprobed" (`:38-49`). Real.
- **L2** (`routing/l2-classifier.ts:27-45`): LLM JSON classifier, zod-validated, fail-open to
  `null` on bad JSON/throw. **Default OFF** (`routing/config.ts:26`), so in practice no L2.
- **L3 synthesis** (`routing/synthesize.ts:150-237`): the actual decision layer. Picks primary
  (`:106-118`), channels/tools (`:12-48`), fallback chain (`:50-72`), plus three post-hoc rewrites:
  gray→`kb_doc` retrieve_safe (`:186-203`), KB-content-regex rescue (`:207-226`), and
  neo4j-down degradation (`:228-235`).

**What actually decides routing in production:** `decideQueryRoute` → `resolveIntentPlan`
(`apps/web/lib/chat/query-router.ts:236-277`) → L0 regexes, then **one Top-1 dense probe against
the KB** (`apps/web/lib/chat/embedding-precheck.ts:22-67`), then threshold banding. That is it.
The Neo4j probe is genuinely wired before routing (`query-router.ts:57-90`, 30 s TTL, 2 s timeout,
single-flight).

**Fallbacks and failure modes (all real):**

- hybrid ES error → vector-only (`hybrid-search.ts:92-95`)
- Corrective rewrite/re-search error → original hits (`corrective.ts:65-79`)
- rerank HTTP error/timeout/non-OK → LLM fallback or cosine sort (`rerank.ts:47-62`)
- embedding failure → `probed: false` → gray, never throws (`embedding-precheck.ts:61-66`)
- Neo4j down → `graph_relation`/`kb_graph_hybrid` downgraded to `kb_doc` (`synthesize.ts:74-86`,
  `:228-235`); Chat then removes `needsGraphContext`
- graph query failure in Chat → warn and continue (`apps/web/app/api/chat/route.ts:290-293`),
  12 s wrapper (`route.ts:33`, `:51-53`)
- vector search timeout → 10 s grace, then adopt the late result if it lands
  (`retrieve.ts:99-133`, `RETRIEVAL_GRACE_MS = 10_000` at `rag-options.ts:33`)

**Failure modes that are _not_ handled:**

- Graph intent is terminal for Chat: `graphOnlyRetrieve` skips KB entirely
  (`route.ts:256-263`) and the KB fallback only fires if the graph returned zero paths
  (`route.ts:296-312`). If Neo4j is up but has no data, the user gets a no-context answer.
- `decideWithSharedRouter` hardcodes `fastPath: true` on every decision
  (`query-router.ts:257`) — the field is meaningless in the default path.
- If L1 cannot probe (`!kb.probed`), a non-matching query falls to `general` + `ambiguous: true`
  (`synthesize.ts:117`, `:128-134`), and `mapIntentPlanToChatRoute` takes the _final_ fallback
  `route: "direct"` (`chat-map.ts:59`) — the plan is marked ambiguous but Chat answers from
  parametric knowledge. Only Agent consumes `ambiguous` (`chat-map.ts:16-19`).

---

## 3. Code quality

### Good

- Dependency injection everywhere: `HybridSearchDeps` (`hybrid-search.ts:23-32`),
  `CollectL1SignalsDeps`, `ResolveIntentPlanDeps`, `GraphQueryExecutor` (`graph-rag.ts:46-49`).
  This is why the suite runs with no live services.
- Timeouts/aborts are deliberate and present: `AbortSignal.timeout(8_000)` (`rerank.ts:45`),
  `NEO4J_TX_TIMEOUT_MS` + `connectionAcquisitionTimeout` + `maxTransactionRetryTime`
  (`graph-rag.ts:244`, `:259-262`), `withTimeout` with `timer.unref()` (`route.ts:36-47`),
  grace-period race (`retrieve.ts:99-133`).
- Fail-closed ACL: empty `documentIds` returns `[]` (not "all") in vector store
  (`vector-store.astra.ts:150-152`), Milvus (`vector-store.milvus.ts:204-206`), BM25
  (`es-bm25.ts:134-136`), and graph (`graph-rag.ts:308-312`).
- Typing: discriminated unions for results (`context.ts:26-30`), `as const` enums
  (`routing/types.ts:4-21`), zod at all LLM/persistence boundaries
  (`rerank.ts:5-7`, `l2-classifier.ts:13-18`, `extract-schema.ts:9-23`, `routing/types.ts:29-42`).
- The allowlist is defensive beyond the obvious: rejects unlabeled nodes, untyped rels,
  non-allowlisted labels _and_ rel types, multi-statements, and unbounded var-length
  (`graph-cypher-allowlist.ts:110-175`).
- Cache design is honest and documented: LRU with recency refresh (`embedding-cache.ts:30-57`),
  explicit YAGNI rationale for no TTL/Redis (`embedding-cache.ts:10-15`).

### Bad

- **Duplicated greeting/intent logic.** `apps/web/lib/chat/query-intent.ts:5-46` and
  `packages/shared/src/routing/l0-rules.ts:9-48` are the same 20-phrase set + same
  `TRAILING_PUNCTUATION` regex + same `isPureMathExpression` + same `isEmptyQuery`. The web copy
  is only reachable when `ENABLE_INTENT_ROUTER=false` (`query-router.ts:272-276`), and
  `query-router.ts:25` imports the _local_ copy rather than the shared one. Two sources of truth
  for routing behavior.
- **The Neo4j availability probe is copy-pasted**: identical cache/TTL/timeout/single-flight code
  at `apps/web/lib/chat/query-router.ts:51-97` and
  `apps/agent-service/src/routing/intent-plan.ts:18-67`. Only differing detail: `intent-plan.ts`
  calls `timer.unref?.()` (`:34`), `query-router.ts` does not (`:64`) — an unref'd timer leak in
  the web path.
- **Human-readable text as a data channel.** The Agent's L1 probe parses tool prose with a regex
  (`apps/agent-service/src/routing/intent-plan.ts:69-78`) against a format emitted at
  `apps/agent-service/src/tools/kb-search.tool.ts:70`. Same coupling in
  `agent.service.ts:89`. The fallback `最高相似度\s*([0-9.]+)` (`intent-plan.ts:71`) matches no
  current producer — a stale second format kept alive.
- **Prompt/parse duplication**: `rerank.ts:91-131` is a near-verbatim copy of
  `apps/web/lib/chat/reranker.ts:15-68` (same Chinese prompt, same `order` JSON contract,
  different zod name `RerankOrderSchema` vs `RerankSchema`). `rerankHitsWithLlm` has **zero
  callers** in `apps/` or `packages/` (verified by grep) — ~65 lines of dead code.
- **Config split.** `apps/web/lib/chat/rag-options.ts` reads raw `process.env` while
  `packages/shared/src/schemas/env.ts:56-58` also models `ENABLE_RERANKER`; thresholds
  `ROUTE_RETRIEVE_SIMILARITY`/`ROUTE_DIRECT_SIMILARITY` are parsed twice
  (`rag-options.ts:27-30`, `routing/config.ts:27-28`) with independently hardcoded defaults.
  `l1-signals.ts:26-27` _also_ hardcodes `0.68`/`0.42`.
- **No caching on the hot path.** `retrieve.ts` → `hybridSearch` → `embedText`
  (`hybrid-search.ts:66`) bypasses `embedQueryText`/`EmbeddingCache` entirely; the LRU is used
  only by the precheck (`embedding-precheck.ts:31`). Each chat turn embeds the same query twice
  with zero reuse.
- **No connection reuse for the vector store**: `getStore` is `getVectorStoreForCorpus`
  (`hybrid-search.ts:41-43`) which constructs a **new** `DataAPIClient` per call inside
  `createAstraVectorStore` (`vector-store.astra.ts:89`), while `embeddings.ts:39-50`,
  `graph-rag.ts:242` and `es-client.ts:3` all memoize their clients. With `ENABLE_MULTI_QUERY`
  this is 4 client constructions + 4 TCP/TLS handshakes per message.
- **Dead/unreachable code in `resolve.ts:54-68`**: the `if (deps.classifyL2)` branch and the
  `else if` branch are semantically identical. `synthesize.ts:205` (`void cfg.enableL2IntentClassifier;`)
  is a no-op statement existing only to suppress an unused-variable lint.
- **Duplicated entity-resolution wiring**: `resolveProductName` is a deprecated pass-through
  (`graph-rag.ts:64-67`) kept alongside `resolveSeedProductName`
  (`routing/graph-entities.ts:14-16`).
- `resolve.ts:31` defaults `neo4jAvailable` to `true` when no probe is supplied, so a caller that
  forgets the probe silently routes graph intents that cannot be served.

---

## 4. TODO / FIXME / stub / mock / hardcoded

Full-tree grep over the scoped dirs returns **no `TODO`, `FIXME`, `XXX`, `HACK`, `WIP`, or
"not implemented"** in production retrieval code. The unfinished work is marked differently:

| Marker                                                 | Location                                         | Meaning                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `@deprecated`                                          | `graph-rag.ts:64`, `query-router.ts:279`         | superseded APIs kept for tests                                                               |
| `@deprecated`                                          | `apps/web/lib/chat/corpus-filters.ts:6-9`        | "superseded by physical corpus collections… Kept for embedding-precheck until that migrates" |
| "narrow-domain until workspace entity registry exists" | `routing/graph-entities.ts:3`                    | graph layer is a demo single-product subgraph                                                |
| "Production graph layer is narrow-domain"              | `routing/graph-entities.ts:3`                    | see above                                                                                    |
| "Phase 3 demo graph seed entities"                     | `routing/graph-entities.ts:2`                    | seed regex `SEED_GRAPH_ENTITY_RES = [/珍珠奶茶/, /pearl\s*milk\s*tea/i]` (`:6`)              |
| "Test hook for catalog-first routing without live PG"  | `routing/entity-resolve.ts:22-25`                | the only way catalog routing is reachable                                                    |
| "until plan 03-03"                                     | `vector-store.astra.ts:205`, `schemas/env.ts:56` | acknowledged migration debt                                                                  |
| "Demo" fixtures                                        | `graph-rag.ts:146`, `:188`                       | in-memory fake paths used as Agent test helpers                                              |

Hardcoded values that matter:

- `packages/shared/src/ai/embedding-models.ts:12` — `nvidia/nemotron-3-embed-1b`, dim `2048`
  (`:14`), pinned after a 410-Gone incident documented at `:9-10`.
- `packages/shared/src/rag/graph-rag.ts:52-62` — milk-tea seed graph hardcoded in source.
- `packages/shared/src/routing/graph-entities.ts:15` — seed product name `"珍珠奶茶"`.
- `apps/web/lib/chat/rag-options.ts:33-44` — `RETRIEVAL_GRACE_MS=10_000`,
  `TOP1_SIMILARITY_THRESHOLD=0.55`, `RETRIEVAL_LIMIT=5`, and **two dead constants**:
  `SEED_CORPUS_SIMILARITY_THRESHOLD` (`:39-42`) and `RERANKER_CANDIDATE_LIMIT` (`:45`) have no
  readers outside `rag-options.ts`.
- `packages/shared/src/rag/hybrid-search.ts:34`, `rerank.ts:29`, `corrective.ts:11`,
  `l1-signals.ts:26-27` — scattered thresholds with independent literals.

Mock/fixture code living in the production module: `graph-rag.ts:146-228`
(`createSeededMilkTeaFixtureExecutor`, `createCatalogEntityFixtureExecutor`) is exported from the
public package barrel (`packages/shared/src/index.ts:131-132`) and used by
`apps/agent-service/src/tools/graph-search.tool.ts:131-156` as _test helpers_ — acceptable, but
they sit in the hot RAG module and one of them (`:181-184`) ignores its `params` argument
entirely, so no test can ever catch a wrong-parameter bug through it.

---

## 5. Over-engineered vs under-built

### Over-engineered

1. **A 9-value `PrimaryIntent` taxonomy + `channels` + `specialists` + `retrieverTools` +
   `confidence` + `graphSignal` + `ambiguous` + `fallbackChain`** (`routing/types.ts:29-42`) where
   Chat consumes exactly two fields — `plan.primary` and `plan.reason` (`chat-map.ts:25-59`).
   `fallbackChain`, `channels`, `confidence`, `ambiguous` are Agent-only.
2. **Corrective RAG as a pseudo-agent.** The file header (`corrective.ts:1-5`) spends five lines
   explaining that there is deliberately _no_ Corrective sub-agent, then implements one LLM call
   and one bool. The ceremony outweighs the behavior.
3. **`graph-cypher-templates.ts:26-29`**, one of three templates, is a single hand-written 3-hop
   query for one hardcoded product; the allowlist (`graph-cypher-allowlist.ts`) is ~176 lines of
   defensive parser for a system whose Cypher is never LLM-generated (templates are selected by
   enum at `graph-cypher-templates.ts:65-76`). Good security hygiene, disproportionate to the
   actual attack surface.
4. **`synthesize.ts:186-226`** stacks two heuristic rescues (`kbGray → kb_doc`, then a
   6-alternative regex `looksLikeKbContentQuery` at `:136-141`) on top of L0's own KB regex
   (`l0-rules.ts:53`, `:90`) — three overlapping mechanisms deciding "is this a KB question".
5. **Config read per request.** `readIntentRouterConfig()` is called on every routing decision
   (`query-router.ts:272`, `resolve.ts:29`, `synthesize.ts:152`) while `rag-options.ts` reads once
   at module load. Inconsistent, and the per-request version re-parses env needlessly.

### Under-built

1. **BM25 is not actually part of production retrieval.** The read path ignores `isEsConfigured()`
   (§1.3), so the flagship "hybrid" claim degrades to vector + RRF-over-one-list + rerank. The
   `rrf.ts:27` comment ("Prefer later lists (vector cosine)") means ES hits enter the fused list
   carrying `similarity` from `es-bm25.ts:121` = **0**, which the Chat top-1 gate
   (`retrieve.ts:46-48`, threshold 0.55) and the Agent filter (`agent-service/src/rag/retrieve.ts:104`,
   default 0.60) then discard.
2. **Graph RAG is unreachable for user data.** `route.ts:277` requires `corpus === "seed"`;
   user workspace graphs are built at ingest (`upsertDocumentGraph`, `graph-extract.ts`) but
   never queried by Chat. The `entity_rel_path` template
   (`graph-cypher-templates.ts:25-29`) is effectively test-only.
3. **Catalog-first routing is wired but not connected.** `resolveGraphEntity` needs
   `workspaceId && store` (`entity-resolve.ts:34`); the store can only come from the arg or the
   module-global test hook (`entity-resolve.ts:20-25`). `entities` _are_ written to Postgres at
   ingest (`entity-catalog-store.ts`, `graph-extract.ts:42-43`), and `createEntityCatalogStore`
   exists — but **no production caller passes it** (`query-router.ts:241-250`, `resolve.ts:33-36`).
   So catalog entity linking never runs in production; `resolveGraphEntity` always falls through
   to the two-entry seed regex (`graph-entities.ts:6`).
4. **No eval harness for retrieval quality.** `tests/eval/phase-3/golden.json` + `nightly.test.ts`
   exist but no recall/precision/nDCG metric is asserted anywhere in the scoped code; the
   "regression" tests assert shapes and mock plumbing (§6).
5. **No metrics on retrieval quality** — the only telemetry is counts and cache hit/miss
   (`retrieve.ts:235`, `:239`, `embedding-service.ts:28-32`); no rerank lift, no RRF
   contribution, no per-stage drop-off (candidates in vs. returned).

---

## 6. Are the tests meaningful?

Mostly yes; the unit layer is genuinely behavioral, the regression layer is largely mock-shaped.

### Meaningful (asserts real behavior)

- `rrf.test.ts:19-56` — asserts exact fused ordering, tie behavior, that `similarity` stays
  cosine-scale while `bm25Score` is preserved. Catches real regressions.
- `graph-cypher-allowlist.test.ts:14-79` — adversarial: 7 destructive statements, unlabeled nodes,
  non-allowlisted labels/rels, untyped rels, `|`-lists with a bad member, `*` unbounded, `*1..5`
  too long. This is the best test file in scope.
- `corrective.test.ts:45-127` — asserts _negative_ behavior (rewrite not called above threshold,
  not called on the second pass, original hits returned when re-search rejects or is empty).
- `embedding-cache.test.ts:25-54` — real LRU semantics: eviction order and the recency-refresh
  case that a naive Map implementation gets wrong.
- `hybrid-search.test.ts:28-58` (ES throw → vector-only + `logWarn` args), `:74-131` (rewrite
  called exactly once, second search returns the stronger hit), `:133-157` (HyDE embed text vs
  BM25 query split — a subtle contract), `:159-193` (empty allowlist → `[]`).
- `neo4j-upsert.test.ts:34-109` — asserts the actual Cypher strings and bound parameters
  (`MERGE (d:Document {id: $documentId})`, entity row shape, `RELATED_TO` params).
- `extract-entities.test.ts:45-48`, `:81-89` — asserts the LLM failure is **propagated**, not
  swallowed into an empty graph. Exactly the right assertion.
- `query-router.test.ts:90-109` — Neo4j-down degradation asserted end-to-end through
  `decideQueryRoute`, including the `needsGraphContext` removal.
- `resolve.test.ts:34-42` — asserts L1 is _not_ called when L0 is terminal (`probeKb` never
  invoked), which is the tiering contract from `resolve.ts:42`.

### Weak / tautological

- `embedding-precheck.test.ts` (19 lines) tests only `precheckSuggestsRetrieve/Direct`, i.e. two
  `>=`/`<` comparisons against constants. `probeKbRelevance`'s 45 lines are covered only
  incidentally by `embedding-failopen.test.ts:47-55`.
- `rag-options.test.ts:11-18` asserts `ENABLE_RERANKER === true`, then `if (ENABLE_RERANKER ===
"false") expect(false)` and returns — the test deletes its own assertion on the escape path.
- `query-router.test.ts:78-88` ("灰色地带 probe → retrieve") claims to test "gray" but the
  result is `intentPrimary: "kb_doc"` — `synthesize.ts:188-202` converted the gray band into a
  hard `kb_doc`, so the gray-band _routing_ path (`chat-map.ts:53`) is never actually exercised.
- `reranker.test.ts:16-38` covers only the web LLM reranker, which has **no callers** (§3). The
  production `rerankDedicated` (`rerank.ts:17`) — HTTP path, `mapDedicatedResults` bounds
  checking, timeout, LLM fallback — has **zero tests**.
- `graph-rag.test.ts` exercises only fixture executors; every assertion runs against
  `createSeededMilkTeaFixtureExecutor` (`graph-rag.ts:146-185`), whose callback ignores `params`.
  The real `defaultExecutor` (`graph-rag.ts:273`), `pathFromNeo4j` (`:77`) and `filterPaths`
  (`:308`) are untested.
- **No tests at all for `es-bm25.ts`** — 171 lines including the entire BM25 query, index
  settings, bulk error handling, and `mapHit`. Only the mocked `esSearch` dep is ever exercised.
- `hybrid-search.test.ts:159-193` returns early at `hybrid-search.ts:60-62`; it asserts a
  fail-closed ACL path that bypasses the ES and vector calls it stubs. (It also spends ~1.7 s in
  module/env initialization — see below.)

### Regression/eval layer: mock-shaped, and one test encodes a bug

- `tests/regression/phase-3/01-hybrid-proper-noun.test.ts:53-73` is titled "hybridSearch surfaces
  proper-noun user doc via BM25+RRF" and passes `esSearch: async () => [USER_DOC, ...]` where
  `USER_DOC.similarity = 0.71` (`:16`). Real BM25 results carry `similarity: 0`
  (`es-bm25.ts:121`). The test therefore passes only because the fixture injects a cosine value
  the production code cannot produce. This is the exact case §5.1 flags, and the regression suite
  is green because of it.
- `tests/regression/phase-4/02-entity-catalog-routing.test.ts:32-38` installs the catalog store
  via `setEntityCatalogStoreForTests` — the test-only global (§5.3). It proves the _logic_ works
  and simultaneously guarantees the production wiring gap can never be caught.
- `tests/regression/phase-3/07-intent-routing.test.ts` (418 lines) mocks
  `resolveIntentPlanForAgent`, `invokeGraphSearch`, `invokeKbSearch`, the whole `ai` module and
  `@ai-sdk/langchain`. It verifies orchestration shape, not retrieval.
- **Runner hygiene**: root `vitest.config.ts` excludes only `node_modules/**` and `.next/**`, so
  `apps/web/**` includes the checked-in build output `apps/web/.next/standalone/apps/web/**` and
  runs every test file twice (visible in the run: 49 files, 254 tests, with duplicated
  `reranker.test.ts`, `rag-options.test.ts`, `embedding-precheck.test.ts` …). The exclude pattern
  should be `.next/**`-anchored at any depth.
- `tests/setup-env.ts` sets `??=` dummies, but the repo `.env` is loaded by the dotenvx preload
  during test runs (observed: "injected env (39) from .env"), so real local values such as
  `ENABLE_RERANKER=true` and a live `RERANK_URL` reach the tests. Tests depending on defaults are
  therefore environment-sensitive — e.g. `hybrid-search.test.ts` mutates `process.env.ENABLE_RERANKER`
  globally at `:29` without restoring it.

---

## Verdict

The subsystem is **substantially real, competently engineered, and materially over-claimed
relative to what runs in production**. Dense retrieval, RRF, the ES client/BM25 query, the
dedicated reranker, the corrective pass, the graph executor and the Cypher allowlist are all
genuine implementations with sensible DI, timeouts and fail-open/fail-closed choices. What is
missing is not code but _connection_: BM25 is disabled by configuration yet still called on every
read, graph retrieval is gated to the demo seed corpus, and catalog entity linking is written but
never wired. The test suite is above average at the unit level and misleading at the regression
level — one regression test passes only because its fixture fabricates a value the production
code cannot emit.

### Severity-ranked issues

**S1 — High**

1. **Hybrid fusion silently degenerates to vector-only in production.** ES writes are gated by
   `isEsConfigured()` (`ingest-worker/.../upsert.ts:36`) but the read path is not
   (`hybrid-search.ts:86`, `es-client.ts:16`). Every retrieval pays a failed connect to
   `localhost:9200`. Fix: short-circuit `esSearch` when `!isEsConfigured()`.
2. **BM25-only hits can never pass the relevance gates.** `es-bm25.ts:121` sets `similarity: 0`,
   yet both gates are cosine-based: `retrieve.ts:46-48` (0.55) and
   `agent-service/src/rag/retrieve.ts:104` (0.60). The whole proper-noun-recall premise is
   defeated. Fix: gate on RRF rank/`rerankScore`/`bm25Score` when `similarity === 0`, or normalise
   BM25 into the same scale.
3. **Graph RAG is dead for user documents.** `apps/web/app/api/chat/route.ts:277` gates on
   `corpus === "seed"` while the default corpus is `user` (`corpus-filters.ts:27`). All ingest-time
   graph extraction (`neo4j-upsert.ts`, `graph-extract.ts`) is queryable only by the Agent, never
   by Chat.
4. **Catalog-first entity routing is unreachable in production.** `entity-resolve.ts:20-25`
   exposes the only injection point as a test hook; no production caller passes `catalogStore`
   (`query-router.ts:241`, `resolve.ts:33`). Real, populated PG catalogs
   (`entity-catalog-store.ts`) are ignored, and `resolveGraphEntity` always degrades to a
   two-entry seed regex (`graph-entities.ts:6`).

**S2 — Medium**

5. **No embedding cache on the retrieval path.** `hybrid-search.ts:66` calls `embedText` directly;
   `EmbeddingCache` is only used by the precheck (`embedding-precheck.ts:31`). Every turn embeds
   the same query twice.
6. **Vector store client constructed per search.** `hybrid-search.ts:41-43` +
   `vector-store.astra.ts:89` build a fresh `DataAPIClient` each call, unlike the memoized
   embedding/graph/ES clients (`embeddings.ts:39`, `graph-rag.ts:242`, `es-client.ts:3`).
   4× with multi-query enabled.
7. **Backend-divergent similarity scales** — Astra passthrough (`astra.ts:59`) vs Milvus
   `(s+1)/2` (`milvus.ts:69-74`) against fixed thresholds in `rag-options.ts:27-36` and
   `l1-signals.ts:26-27`. Switching `VECTOR_BACKEND` silently re-tunes the router.
8. **Graph intent has no KB fallback when the graph is up but empty.** `route.ts:256-263` skips
   KB for `graphOnlyRetrieve`; the fallback at `:296-312` fires only on zero paths, and Neo4j
   reachability alone keeps the graph path alive (`synthesize.ts:86`).
9. **`resolve.ts:31` defaults `neo4jAvailable` to `true`** so an unwired caller silently emits
   unservable graph intents.
10. **Duplicated routing logic**: greeting list / punctuation regex / pure-math / empty-query in
    both `query-intent.ts:5-46` and `l0-rules.ts:9-48`; Neo4j probe copy-pasted with a timer-unref
    discrepancy (`query-router.ts:64` vs `intent-plan.ts:34`); rerank prompt duplicated between
    `rerank.ts:91` and `reranker.ts:15` (the latter having zero callers).
11. **Text-protocol coupling for the Agent's L1 probe** (`intent-plan.ts:69-78` parsing
    `kb-search.tool.ts:70`), with a stale second regex branch.
12. **Regression test bakes in the S1.2 bug** —
    `tests/regression/phase-3/01-hybrid-proper-noun.test.ts:16` stubs a BM25 hit with
    `similarity: 0.71`, which production cannot produce.
13. **Test runner double-executes the whole suite** through the checked-in `.next/standalone`
    mirror; `vitest.config.ts` excludes only `.next/**`, not `**/.next/**`.

**S3 — Low**

14. Unused constants `SEED_CORPUS_SIMILARITY_THRESHOLD` / `RERANKER_CANDIDATE_LIMIT`
    (`rag-options.ts:39-45`); unreachable `if/else if` in `resolve.ts:54-68`; no-op `void cfg…` in
    `synthesize.ts:205`.
15. `decideWithSharedRouter` hardcodes `fastPath: true` (`query-router.ts:257`).
16. `synthesize.ts:117` lets an unprobed/kbLow query reach Chat as `direct` via
    `chat-map.ts:59`, despite `ambiguous: true` — the ambiguity flag is Agent-only.
17. `graph-rag.ts:353-358` has two ternary branches with identical bodies.
18. Exported `seedMilkTeaSubgraph` (`graph-rag.ts:383`) has no caller anywhere, so the seed
    subgraph the graph tests and fixture assume must be created by hand.
19. `createSeededMilkTeaFixtureExecutor`'s callback discards `params` (`graph-rag.ts:181`),
    making parameter-binding regressions untestable through it.
20. Zero tests for `es-bm25.ts` (171 lines) and zero tests for the production
    `rerankDedicated` HTTP path (`rerank.ts:17-63`).
