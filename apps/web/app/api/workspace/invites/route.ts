import { NextResponse } from "next/server";

import { getActiveWorkspaceId, requireSession } from "@/lib/auth/session";
import {
  acceptWorkspaceInvite,
  createWorkspaceInvite,
} from "@/lib/auth/workspace.service";
import type { WorkspaceRole } from "@/lib/db/entities/workspace-member.entity";

const INVITE_ROLES = new Set<WorkspaceRole>(["owner", "editor", "viewer"]);

/** POST /api/workspace/invites — create invite (owner only, D-41) */
export async function POST(req: Request) {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;

  const body = (await req.json()) as { email?: string; role?: WorkspaceRole };
  if (!body.email?.trim()) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  const role = body.role ?? "viewer";
  if (!INVITE_ROLES.has(role)) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }

  const workspaceId = getActiveWorkspaceId(authResult.session);
  const invite = await createWorkspaceInvite({
    workspaceId,
    inviterUserId: authResult.session.user.id,
    email: body.email,
    role,
  });
  if (!invite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt.toISOString(),
    },
  });
}

/** PUT /api/workspace/invites — accept invite by token */
export async function PUT(req: Request) {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;

  const body = (await req.json()) as { token?: string };
  if (!body.token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const email = authResult.session.user.email;
  if (!email) {
    return NextResponse.json({ error: "Session email required" }, { status: 400 });
  }

  const result = await acceptWorkspaceInvite(body.token.trim(), authResult.session.user.id, email);
  if (!result) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
  }

  return NextResponse.json(result);
}
