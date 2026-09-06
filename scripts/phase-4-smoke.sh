#!/usr/bin/env bash
# Phase 4 compose smoke gate (PROD-01).
#
# Required: stack running via `docker compose up -d --build`
# Env (optional overrides):
#   WEB_URL=http://localhost:3000
#   AGENT_URL=http://localhost:3002
#   INGEST_URL=http://localhost:3001
#   PROMETHEUS_URL=http://localhost:9090
#
# Exits 0 when web, agent-service, ingest-worker health + Prometheus /-/healthy return HTTP 200.

set -euo pipefail

WEB_URL="${WEB_URL:-http://localhost:3000}"
AGENT_URL="${AGENT_URL:-http://localhost:3002}"
INGEST_URL="${INGEST_URL:-http://localhost:3001}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"

check() {
  local name="$1"
  local url="$2"
  local code
  code=$(curl -fsS -o /dev/null -w "%{http_code}" "$url")
  if [[ "$code" != "200" ]]; then
    echo "[FAIL] $name $url -> HTTP $code" >&2
    exit 1
  fi
  echo "[OK] $name $url"
}

check "web" "${WEB_URL}/api/health"
check "agent-service" "${AGENT_URL}/health"
check "ingest-worker" "${INGEST_URL}/health"
check "prometheus" "${PROMETHEUS_URL}/-/healthy"

echo "phase-4-smoke: all checks passed"
