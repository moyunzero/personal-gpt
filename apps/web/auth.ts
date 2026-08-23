import NextAuth, { type Session } from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { TypeORMAdapter } from "@auth/typeorm-adapter";

import { AuthAccountEntity } from "@/lib/db/entities/auth-account.entity";
import { AuthSessionEntity } from "@/lib/db/entities/auth-session.entity";
import { AuthVerificationTokenEntity } from "@/lib/db/entities/auth-verification-token.entity";
import { UserEntity } from "@/lib/db/entities/user.entity";
import { getDataSource } from "@/lib/db/get-data-source";

import { bootstrapPersonalWorkspace } from "@/lib/auth/workspace-bootstrap";

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

const authEntities = {
  UserEntity,
  AccountEntity: AuthAccountEntity,
  SessionEntity: AuthSessionEntity,
  VerificationTokenEntity: AuthVerificationTokenEntity,
};

function authEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authEnv("AUTH_SECRET") || authEnv("NEXTAUTH_SECRET"),
  adapter: TypeORMAdapter(authEnv("DATABASE_URL"), { entities: authEntities }),
  providers: [
    Nodemailer({
      server: authEnv("EMAIL_SERVER"),
      from: authEnv("EMAIL_FROM"),
    }),
  ],
  session: { strategy: "database" },
  pages: {
    signIn: "/api/auth/signin",
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
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
        const ds = await getDataSource();
        const row = await ds.getRepository(UserEntity).findOne({ where: { id: user.id } });
        session.user.activeWorkspaceId = row?.activeWorkspaceId ?? null;
      }
      return session;
    },
  },
  trustHost: true,
});

export type AppSession = Session;
