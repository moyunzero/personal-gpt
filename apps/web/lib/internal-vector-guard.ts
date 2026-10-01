/** Shared request hardening for CloudBase → Vercel Astra relays. */

export const INTERNAL_VECTOR_MAX_BODY_BYTES = 1_000_000;
export const INTERNAL_VECTOR_MAX_CHUNKS = 200;
export const INTERNAL_VECTOR_MAX_CHUNK_CHARS = 32_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export type InternalVectorGuardFailure = {
  ok: false;
  status: number;
  error: string;
};

export type InternalVectorGuardOk = { ok: true };

/** Reject oversized bodies before JSON parse when Content-Length is present. */
export function assertInternalVectorContentLength(
  req: Request,
  maxBytes = INTERNAL_VECTOR_MAX_BODY_BYTES,
): InternalVectorGuardOk | InternalVectorGuardFailure {
  const raw = req.headers.get("content-length");
  if (!raw) return { ok: true };
  const n = Number(raw);
  if (Number.isFinite(n) && n > maxBytes) {
    return { ok: false, status: 413, error: "body_too_large" };
  }
  return { ok: true };
}

export function assertNoCustomCollectionName(
  collectionName: string | undefined | null,
): InternalVectorGuardOk | InternalVectorGuardFailure {
  if (collectionName != null && String(collectionName).trim() !== "") {
    return { ok: false, status: 400, error: "collectionName_not_allowed" };
  }
  return { ok: true };
}

export function assertChunksPayload(
  chunks: unknown,
): InternalVectorGuardOk | InternalVectorGuardFailure {
  if (!Array.isArray(chunks)) {
    return { ok: false, status: 400, error: "chunks_required" };
  }
  if (chunks.length > INTERNAL_VECTOR_MAX_CHUNKS) {
    return { ok: false, status: 400, error: "chunks_limit_exceeded" };
  }
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== "object") {
      return { ok: false, status: 400, error: "invalid_chunk" };
    }
    const text = (chunk as { text?: unknown }).text;
    if (typeof text === "string" && text.length > INTERNAL_VECTOR_MAX_CHUNK_CHARS) {
      return { ok: false, status: 400, error: "chunk_text_too_large" };
    }
  }
  return { ok: true };
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

/** Simple in-memory rate limit for internal proxy key (per isolate). */
export function checkInternalProxyRateLimit(
  key: string,
  limit = 60,
  windowMs = 60_000,
): InternalVectorGuardOk | InternalVectorGuardFailure {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, status: 429, error: "rate_limited" };
  }
  bucket.count += 1;
  return { ok: true };
}

export function resetInternalProxyRateLimitForTests(): void {
  rateBuckets.clear();
}
