import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret gate for CloudBase → Vercel internal vector relay.
 * Header: x-internal-proxy-key
 */
export function isTrustedInternalProxy(req: Request): boolean {
  const expected = process.env.INTERNAL_PROXY_KEY?.trim();
  if (!expected) return false;
  const provided = req.headers.get("x-internal-proxy-key")?.trim();
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
