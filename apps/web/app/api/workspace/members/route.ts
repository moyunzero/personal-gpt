import { NextResponse } from "next/server";

import { requireSession, getActiveWorkspaceId } from "@/lib/auth/session";
import { getMemberRole, listWorkspaceMembers } from "@/lib/auth/workspace.service";

/** GET /api/workspace/members — members of the active workspace (for restricted allowlist UI). */
export async function GET() {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;

  const workspaceId = await getActiveWorkspaceId(authResult.session);
  const role = await getMemberRole(authResult.session.user.id, workspaceId);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await listWorkspaceMembers(workspaceId);
  return NextResponse.json({ members });
}
