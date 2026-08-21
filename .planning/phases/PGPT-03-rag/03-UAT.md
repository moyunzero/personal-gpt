---
status: testing
phase: 03-rag
source:
  - 03-VERIFICATION.md
started: 2026-08-21T17:10:00Z
updated: 2026-08-21T17:10:00Z
---

## Current Test

number: 1
name: Live ES dual-write ingest/delete
expected: |
  Ingest job completes; ES has matching docs for corpus index; delete removes both vector + ES
awaiting: user response

## Tests

### 1. Live ES dual-write ingest/delete
expected: docker compose up -d elasticsearch && upload a KB doc; confirm ES index receives chunks and Astra/Milvus dual-write succeeds; delete removes both vector + ES
result: pending

### 2. Live Neo4j graph_search path
expected: With Neo4j up and milk-tea subgraph seeded, Agent graph_search returns GRAPH_RAG_STATUS: HIT with Product→Ingredient→Method path
result: pending

### 3. Optional Mem0 live preference recall
expected: Session A stores preference; session B recalls for same workspaceId:userKey without mock
result: pending

### 4. Optional live rerank API
expected: ENABLE_RERANKER with real Cross-Encoder/API ranks user doc above vector-only noise; false disables
result: pending

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
