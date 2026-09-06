import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "agent_" });

export const graphHitTotal = new client.Counter({
  name: "graph_hit_total",
  help: "Graph search HIT count",
  registers: [register],
});

export const graphMissTotal = new client.Counter({
  name: "graph_miss_total",
  help: "Graph search miss count",
  registers: [register],
});

export const kbSearchDurationSeconds = new client.Histogram({
  name: "kb_search_duration_seconds",
  help: "KB search latency in seconds",
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests handled by agent-service",
  labelNames: ["method", "path", "status"] as const,
  registers: [register],
});

export async function metricsText(): Promise<string> {
  return register.metrics();
}

export function metricsContentType(): string {
  return register.contentType;
}
