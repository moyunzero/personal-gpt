import { metricsContentType, metricsText } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prometheus scrape endpoint (D-52). */
export async function GET() {
  const body = await metricsText();
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": metricsContentType() },
  });
}
