/**
 * 解析 CORS_ORIGIN；credentials 启用时拒绝任何通配 *。
 * Production requires CORS_ORIGIN — no silent localhost fallback.
 */
export function parseCorsOrigins(
  raw: string | undefined,
  fallback = "http://localhost:3000",
): string | string[] {
  const isProd = process.env.NODE_ENV === "production";
  const source = raw?.trim() ? raw : isProd ? undefined : fallback;
  if (source === undefined) {
    throw new Error("CORS_ORIGIN must be set in production");
  }
  const origins = source
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error("CORS_ORIGIN resolved to empty list");
  }
  if (origins.some((o) => o === "*")) {
    throw new Error(
      'Invalid CORS_ORIGIN: wildcard "*" is not allowed when credentials are enabled',
    );
  }
  return origins.length === 1 ? origins[0]! : origins;
}
