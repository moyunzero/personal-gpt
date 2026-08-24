import { createTransport } from "nodemailer";
import NextAuth, { type Session } from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { TypeORMAdapter } from "@auth/typeorm-adapter";

import { authConfig } from "@/auth.config";
import { UserEntity } from "@/lib/db/entities/user.entity";
import { getDataSource } from "@/lib/db/get-data-source";

/** Rewrite Auth.js callback URL → /auth/confirm so email scanners don't burn the token. */
function toConfirmUrl(callbackUrl: string): string {
  const url = new URL(callbackUrl);
  url.pathname = "/auth/confirm";
  return url.toString();
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      activeWorkspaceId?: string | null;
    };
  }
}

function authEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: authEnv("AUTH_SECRET") || authEnv("NEXTAUTH_SECRET"),
  // Default adapter entities live in node_modules (serverExternalPackages) so
  // Next prod minification cannot mangle class/relation names TypeORM needs.
  adapter: TypeORMAdapter({
    type: "postgres",
    url: authEnv("DATABASE_URL"),
  }),
  providers: [
    Nodemailer({
      server: authEnv("EMAIL_SERVER"),
      from: authEnv("EMAIL_FROM"),
      async sendVerificationRequest({ identifier, url, provider }) {
        const confirmUrl = toConfirmUrl(url);
        const { host } = new URL(confirmUrl);
        const transport = createTransport(provider.server);
        const result = await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: `Sign in to ${host}`,
          text: `Sign in to ${host}\n${confirmUrl}\n\n`,
          html: `<body style="background:#f9f9f9;font-family:Helvetica,Arial,sans-serif">
  <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background:#fff;max-width:600px;margin:auto;border-radius:10px">
    <tr><td align="center" style="padding:10px 0;font-size:22px;color:#444">Sign in to <strong>${host}</strong></td></tr>
    <tr><td align="center" style="padding:20px 0">
      <a href="${confirmUrl}" target="_blank"
        style="font-size:18px;color:#fff;text-decoration:none;border-radius:5px;padding:10px 20px;display:inline-block;font-weight:bold;background:#346df1;border:1px solid #346df1">
        Sign in
      </a>
    </td></tr>
    <tr><td align="center" style="padding:0 0 10px;font-size:16px;color:#444">If you did not request this email you can safely ignore it.</td></tr>
  </table>
</body>`,
        });
        const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);
        if (failed.length) {
          throw new Error(`Email(s) (${failed.join(", ")}) could not be sent`);
        }
      },
    }),
  ],
  session: { strategy: "database" },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      const { bootstrapPersonalWorkspace } = await import("@/lib/auth/workspace-bootstrap");
      const ds = await getDataSource();
      await bootstrapPersonalWorkspace(ds, {
        id: user.id,
        email: user.email ?? null,
        name: user.name ?? null,
      });
    },
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        try {
          const ds = await getDataSource();
          const userRows = await ds.query(
            `SELECT active_workspace_id FROM users WHERE id = $1 LIMIT 1`,
            [user.id],
          );
          const activeCol = userRows?.[0]?.active_workspace_id;
          if (typeof activeCol === "string" && activeCol.trim()) {
            const memberRows = await ds.query(
              `SELECT 1 FROM workspace_members
               WHERE user_id = $1 AND workspace_id = $2
               LIMIT 1`,
              [user.id, activeCol.trim()],
            );
            if (memberRows?.length) {
              session.user.activeWorkspaceId = activeCol.trim();
              return session;
            }
          }
          const rows = await ds.query(
            `SELECT workspace_id FROM workspace_members
             WHERE user_id = $1
             ORDER BY created_at ASC
             LIMIT 1`,
            [user.id],
          );
          session.user.activeWorkspaceId =
            typeof rows?.[0]?.workspace_id === "string" ? rows[0].workspace_id : null;
        } catch (err) {
          console.error("[auth] session workspace resolve failed", err);
          session.user.activeWorkspaceId = null;
        }
      }
      return session;
    },
  },
});

export type AppSession = Session;
