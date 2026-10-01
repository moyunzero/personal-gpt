import { timingSafeEqual } from "node:crypto";

function safeTokenEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Prometheus scrape auth: require METRICS_SCRAPE_TOKEN when set; prod fail-closed if unset. */
export function authorizeMetricsScrape(
  authorization: string | null | undefined,
  queryToken: string | null | undefined,
): boolean {
  const expected = process.env.METRICS_SCRAPE_TOKEN?.trim();
  if (!expected) {
    return process.env.NODE_ENV !== "production";
  }
  const bearer = authorization?.replace(/^Bearer\s+/i, "").trim();
  // Production: Bearer only — queryToken leaks into access logs / Referer.
  if (process.env.NODE_ENV === "production") {
    return Boolean(bearer) && safeTokenEqual(bearer!, expected);
  }
  const provided = bearer || queryToken?.trim() || "";
  return Boolean(provided) && safeTokenEqual(provided, expected);
}
