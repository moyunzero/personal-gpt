import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests handled by web BFF",
  labelNames: ["method", "path", "status"] as const,
  registers: [register],
});

export const rateLimitExceededTotal = new client.Counter({
  name: "rate_limit_exceeded_total",
  help: "Total rate-limit rejections",
  labelNames: ["scope"] as const,
  registers: [register],
});

export async function metricsText(): Promise<string> {
  return register.metrics();
}

export function metricsContentType(): string {
  return register.contentType;
}
