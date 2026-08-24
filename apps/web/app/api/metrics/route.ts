import { authorizeMetricsScrape } from "@personal-gpt/shared/metrics-auth";

import { metricsContentType, metricsText } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prometheus scrape endpoint (D-52). Requires METRICS_SCRAPE_TOKEN in production. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (
    !authorizeMetricsScrape(
      req.headers.get("authorization"),
      url.searchParams.get("token"),
    )
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await metricsText();
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": metricsContentType() },
  });
}
