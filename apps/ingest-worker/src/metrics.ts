import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "ingest_" });

export const ingestFailuresTotal = new client.Counter({
  name: "ingest_failures_total",
  help: "Total ingest job failures",
  labelNames: ["step"] as const,
  registers: [register],
});

export const graphExtractDurationSeconds = new client.Histogram({
  name: "graph_extract_duration_seconds",
  help: "Graph LLM extract duration in seconds",
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests handled by ingest-worker",
  labelNames: ["method", "path", "status"] as const,
  registers: [register],
});

export async function metricsText(): Promise<string> {
  return register.metrics();
}

export function metricsContentType(): string {
  return register.contentType;
}
