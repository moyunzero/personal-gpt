const PLACEHOLDER = "ci-build-placeholder";

/** Resolve Auth.js secret with production fail-closed and next-build escape. */
export function resolveAuthSecret(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim() || "");
  const isPlaceholder = !raw || raw === PLACEHOLDER;
  const isProd = env.NODE_ENV === "production";
  const isNextBuild = env.NEXT_PHASE === "phase-production-build";

  if (isPlaceholder) {
    if (isProd && !isNextBuild) {
      throw new Error(
        "Missing or insecure AUTH_SECRET/NEXTAUTH_SECRET: set a real secret in production (ci-build-placeholder forbidden)",
      );
    }
    return PLACEHOLDER;
  }

  return raw;
}
