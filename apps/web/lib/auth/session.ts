import { NextResponse } from "next/server";

import { auth } from "@/auth";

export type AppAuthSession = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    activeWorkspaceId?: string | null;
  };
};

export type SessionResult =
  { session: AppAuthSession; error?: never } | { session?: never; error: NextResponse };

/** Require authenticated session for BFF routes (D-20, D-22). */
export async function requireSession(): Promise<SessionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session: session as AppAuthSession };
}

/** 可选会话：游客模式用；无登录时返回 null（不抛 401）。 */
export async function getOptionalSession(): Promise<AppAuthSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session as AppAuthSession;
}

/** Active workspace from session — fall back to membership if missing (D-20). */
export async function getActiveWorkspaceId(session: AppAuthSession): Promise<string> {
  const fromSession = session.user.activeWorkspaceId?.trim();
  if (fromSession) return fromSession;

  const { getDataSource } = await import("@/lib/db/get-data-source");
  const ds = await getDataSource();
  const rows = await ds.query(
    `SELECT workspace_id FROM workspace_members
     WHERE user_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [session.user.id],
  );
  const workspaceId = typeof rows?.[0]?.workspace_id === "string" ? rows[0].workspace_id : "";
  if (!workspaceId) {
    throw new Error("Session missing activeWorkspaceId");
  }
  return workspaceId;
}

export function getSessionUserId(session: AppAuthSession): string {
  return session.user.id;
}
