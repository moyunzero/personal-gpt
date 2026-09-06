/**
 * Optional CI compose smoke gate (PROD-01).
 * Skips unless COMPOSE_SMOKE=1 — run against a live `docker compose up` stack.
 *
 * Required env when enabled:
 *   COMPOSE_SMOKE=1
 *   WEB_URL, AGENT_URL, INGEST_URL, PROMETHEUS_URL (defaults match local compose ports)
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const enabled = process.env.COMPOSE_SMOKE === "1";
if (!enabled) {
  console.log("compose-smoke: skipped (set COMPOSE_SMOKE=1 to run)");
  process.exit(0);
}

const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../scripts/phase-4-smoke.sh",
);
const result = spawnSync("bash", [scriptPath], { stdio: "inherit" });
process.exit(result.status ?? 1);
