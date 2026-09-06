import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (no TypeORM adapter).
 * Used by middleware; full adapter lives in auth.ts.
 */
export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
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
