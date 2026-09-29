import type { NextAuthConfig } from "next-auth";

import { resolveAuthSecret } from "@/lib/auth/resolve-auth-secret";

/**
 * Edge-safe Auth.js config (no TypeORM adapter).
 * Used by middleware; full adapter lives in auth.ts.
 */
export const authConfig = {
  trustHost: true,
  secret: resolveAuthSecret(),
  pages: {
    error: "/auth/error",
  },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
