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

export async function metricsText(): Promise<string> {
  return register.metrics();
}

export function metricsContentType(): string {
  return register.contentType;
}
