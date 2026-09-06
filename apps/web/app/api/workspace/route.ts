import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { createTeamWorkspace, listUserWorkspaces } from "@/lib/auth/workspace.service";

/** GET /api/workspace — list memberships */
export async function GET() {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;

  const workspaces = await listUserWorkspaces(authResult.session.user.id);
  return NextResponse.json({ workspaces });
}

/** POST /api/workspace — create team workspace (D-42) */
export async function POST(req: Request) {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;

  const body = (await req.json()) as { name?: string };
  const workspace = await createTeamWorkspace(authResult.session.user.id, body.name ?? "");
  if (!workspace) {
    return NextResponse.json({ error: "Invalid workspace name" }, { status: 400 });
  }

  return NextResponse.json({
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
  });
}
