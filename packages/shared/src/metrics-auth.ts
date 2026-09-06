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
  const provided = bearer || queryToken?.trim() || "";
  return provided === expected;
}
