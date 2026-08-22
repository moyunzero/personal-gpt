# Phase 3 — Playwright / browser acceptance

**When:** 2026-08-22  
**Base:** http://127.0.0.1:3000 (web + agent :3002 up; postgres/redis healthy)

## Tooling

| Layer                                                                  | Status                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| Cursor Playwright MCP (`user-playwright`)                              | **Unavailable** — `mcp_auth` timed out; live discovery error |
| Local Playwright (`tests/acceptance/phase-3/run-playwright-smoke.mjs`) | **Used as substitute**                                       |
| Vitest `tests/regression/phase-3`                                      | **13/13 pass**                                               |
| `yarn eval:phase-3`                                                    | **2/2 pass**                                                 |

## Automated UI results

| ID        | Check                                            | Result                                                                |
| --------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| UI-01     | Home loads                                       | PASS                                                                  |
| UI-02     | CorpusToggle visible                             | PASS                                                                  |
| UI-03     | CorpusToggle toggles                             | PASS (DOM; see note)                                                  |
| UI-04     | Chat/Agent mode control                          | PASS                                                                  |
| UI-05     | `/kb` loads                                      | PASS                                                                  |
| UI-06     | KB upload UI                                     | PASS                                                                  |
| UI-07     | `pgpt:userKey` / `pgpt.thread.*` in localStorage | WARN — empty under Playwright+Turbopack (client effects not observed) |
| INFRA-ES  | Elasticsearch :9200                              | FAIL — image pull TLS timeout from Docker Hub                         |
| INFRA-NEO | Neo4j :7474                                      | FAIL — image pull failed                                              |

Screenshots: `tests/acceptance/phase-3/screenshots/`  
Machine JSON: `tests/acceptance/phase-3/PLAYWRIGHT-RESULT.json`

### Notes

- Playwright MCP could not be used; local Chromium Playwright covered SSR/UI presence.
- Turbopack HMR WebSocket fails in headless Chromium; client `useEffect` (memory/thread keys) may not run — **re-check UI-07 in a real browser**.
- Live dual-write / Graph UAT **blocked** until ES + Neo4j images are available (`docker compose up -d elasticsearch neo4j`).

## Verdict (automation layer)

**UI smoke: PASS (with UI-07 WARN).**  
**Live store UAT (ES dual-write, Neo4j graph): NOT RUN — blocked on Docker Hub.**  
Proceed to **manual acceptance plan** below for the four `03-UAT.md` items.
