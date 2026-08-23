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
  | { session: AppAuthSession; error?: never }
  | { session?: never; error: NextResponse };

/** Require authenticated session for BFF routes (D-20, D-22). */
export async function requireSession(): Promise<SessionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session: session as AppAuthSession };
}

/** Active workspace from session DB — never trust client input (D-20). */
export function getActiveWorkspaceId(session: AppAuthSession): string {
  const workspaceId = session.user.activeWorkspaceId?.trim();
  if (!workspaceId) {
    throw new Error("Session missing activeWorkspaceId");
  }
  return workspaceId;
}

export function getSessionUserId(session: AppAuthSession): string {
  return session.user.id;
}
