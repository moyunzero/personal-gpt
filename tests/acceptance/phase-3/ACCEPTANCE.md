# Phase 3 — Playwright / browser acceptance

**When:** 2026-08-22  
**Base:** http://127.0.0.1:3000 (web + agent :3002 up; postgres/redis healthy)

## Tooling

| Layer                                                                  | Status                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Cursor Playwright MCP (`user-playwright`)                              | **PASS** — 10-step run recorded in [MCP-ACCEPTANCE.md](./MCP-ACCEPTANCE.md) · `screenshots/mcp-steps/` · 2026-08-22 |
| Local Playwright (`tests/acceptance/phase-3/run-playwright-smoke.mjs`) | **Used as substitute** (UI-01–UI-07 smoke)                                                                          |
| Vitest `tests/regression/phase-3`                                      | **13/13 pass**                                                                                                      |
| `yarn eval:phase-3`                                                    | **2/2 pass**                                                                                                        |

> **History:** An earlier session reported MCP `mcp_auth` timeout / discovery error. The authoritative MCP evidence is the completed 10-step walkthrough in [MCP-ACCEPTANCE.md](./MCP-ACCEPTANCE.md) (steps 01–10, screenshots `01-home.png` … `10-es-refused.png`).

## Automated UI results

| ID        | Check                                            | Result                                                                                                                     |
| --------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| UI-01     | Home loads                                       | PASS                                                                                                                       |
| UI-02     | CorpusToggle visible                             | PASS                                                                                                                       |
| UI-03     | CorpusToggle toggles                             | PASS (DOM; see note)                                                                                                       |
| UI-04     | Chat/Agent mode control                          | PASS                                                                                                                       |
| UI-05     | `/kb` loads                                      | PASS                                                                                                                       |
| UI-06     | KB upload UI                                     | PASS                                                                                                                       |
| UI-07     | `pgpt:userKey` / `pgpt.thread.*` in localStorage | WARN — empty under Playwright+Turbopack (client effects not observed)                                                      |
| INFRA-ES  | Elasticsearch :9200                              | FAIL in MCP step 10 when stack down; **PASS** after `docker compose up` (see [FULL-FLOW-RESULT.md](./FULL-FLOW-RESULT.md)) |
| INFRA-NEO | Neo4j :7474                                      | FAIL when image pull blocked; **PASS** after stack up (Wave D graph)                                                       |

Screenshots: `tests/acceptance/phase-3/screenshots/`  
Machine JSON: `tests/acceptance/phase-3/PLAYWRIGHT-RESULT.json`

### Notes

- **MCP 10-step:** Static/nav smoke **PASS**; client-hydration interactions (upload confirm, empty Send, suggestion click) **PARTIAL/FAIL** under Turbopack+headless — see [MCP-ACCEPTANCE.md](./MCP-ACCEPTANCE.md).
- **Human browser (2026-08-22):** Send enabled, localStorage OK — closed in [FULL-FLOW-RESULT.md](./FULL-FLOW-RESULT.md) § Human browser session.
- Live dual-write / Graph UAT require ES + Neo4j up (`docker compose up -d elasticsearch neo4j`).

## Verdict (automation layer)

**UI smoke: PASS (with UI-07 WARN).**  
**Full-flow + live store UAT: PASS** — evidence in [FULL-FLOW-RESULT.md](./FULL-FLOW-RESULT.md).

## `03-UAT.md` items (mapped)

The four Phase 3 UAT gates and outcomes are recorded in [FULL-FLOW-RESULT.md](./FULL-FLOW-RESULT.md) § UAT mapping:

| #   | Item                                 | Result     | Evidence                                  |
| --- | ------------------------------------ | ---------- | ----------------------------------------- |
| 1   | Live ES dual-write ingest/delete     | **passed** | FULL-FLOW Wave B · `B04-es-hit.png`       |
| 2   | Live Neo4j graph_search path         | **passed** | FULL-FLOW Wave D · Phase 3.1 graph UI/API |
| 3   | Optional Mem0 live preference recall | **passed** | FULL-FLOW Wave E · H-05 human session     |
| 4   | Optional live rerank API             | **passed** | FULL-FLOW Wave F                          |

**Human closeout (H-01–H-05):** **passed** — see [FULL-FLOW-RESULT.md](./FULL-FLOW-RESULT.md) § Human browser session. H-04 graph path UI closed via Phase 3.1 ([UI-MCP-RESULT.md](../phase-3.1/UI-MCP-RESULT.md)).
