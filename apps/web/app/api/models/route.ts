import { NextResponse } from "next/server";

import { resolveRetrievalContext } from "@/lib/auth/acl-resolver";
import { requireSession } from "@/lib/auth/session";
import {
  addWorkspaceModel,
  listWorkspaceModels,
  setWorkspaceModelSelection,
} from "@/lib/models/workspace-models";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;
  const ctx = await resolveRetrievalContext(authResult.session);
  const data = await listWorkspaceModels(ctx.workspaceId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;
  const ctx = await resolveRetrievalContext(authResult.session);
  const body = (await req.json()) as { modelId?: unknown; apiKey?: unknown };
  if (typeof body.modelId !== "string" || typeof body.apiKey !== "string") {
    return NextResponse.json({ error: "需要模型名称和 API key" }, { status: 400 });
  }
  try {
    const model = await addWorkspaceModel({
      workspaceId: ctx.workspaceId,
      modelId: body.modelId,
      apiKey: body.apiKey,
    });
    return NextResponse.json({ model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "添加失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;
  const ctx = await resolveRetrievalContext(authResult.session);
  const body = (await req.json()) as { chatModelId?: unknown; agentModelId?: unknown };
  try {
    await setWorkspaceModelSelection({
      workspaceId: ctx.workspaceId,
      ...(typeof body.chatModelId === "string" ? { chatModelId: body.chatModelId } : {}),
      ...(typeof body.agentModelId === "string" ? { agentModelId: body.agentModelId } : {}),
    });
    return NextResponse.json(await listWorkspaceModels(ctx.workspaceId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
