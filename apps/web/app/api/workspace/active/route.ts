import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { switchActiveWorkspace } from "@/lib/auth/workspace.service";

/** POST /api/workspace/active — switch active workspace (D-40) */
export async function POST(req: Request) {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;

  const body = (await req.json()) as { workspaceId?: string };
  if (!body.workspaceId?.trim()) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const ok = await switchActiveWorkspace(authResult.session.user.id, body.workspaceId.trim());
  if (!ok) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, workspaceId: body.workspaceId.trim() });
}
