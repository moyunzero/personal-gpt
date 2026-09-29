const PLACEHOLDER = "ci-build-placeholder";

/**
 * Allow placeholder only for intentional build/CI escapes — not merely
 * leftover NEXT_PHASE in a production runtime env (WR-05).
 */
function allowsBuildPlaceholder(env: NodeJS.ProcessEnv): boolean {
  if (env.ALLOW_AUTH_SECRET_PLACEHOLDER === "1") return true;
  if (env.NEXT_PHASE !== "phase-production-build") return false;
  // next build argv includes "build"; a mis-set NEXT_PHASE at runtime does not
  return process.argv.includes("build");
}

/** Resolve Auth.js secret with production fail-closed and next-build escape. */
export function resolveAuthSecret(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim() || "");
  const isPlaceholder = !raw || raw === PLACEHOLDER;
  const isProd = env.NODE_ENV === "production";

  if (isPlaceholder) {
    if (isProd && !allowsBuildPlaceholder(env)) {
      throw new Error(
        "Missing or insecure AUTH_SECRET/NEXTAUTH_SECRET: set a real secret in production (ci-build-placeholder forbidden)",
      );
    }
    return PLACEHOLDER;
  }

  return raw;
}
