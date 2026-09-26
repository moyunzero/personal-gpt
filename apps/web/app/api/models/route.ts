import { NextResponse } from "next/server";

import { resolveRetrievalContext } from "@/lib/auth/acl-resolver";
import { requireSession } from "@/lib/auth/session";
import { getMemberRole } from "@/lib/auth/workspace.service";
import { isKnownProviderBaseURL, vendorById } from "@personal-gpt/shared/ai/model-presets";

import {
  addWorkspaceModel,
  listWorkspaceModels,
  setWorkspaceModelSelection,
} from "@/lib/models/workspace-models";
import { assertProviderModel } from "@/lib/models/verify-provider-model";

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
  const role = await getMemberRole(authResult.session.user.id, ctx.workspaceId);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "无权管理模型" }, { status: 403 });
  }
  const body = (await req.json()) as {
    vendorId?: unknown;
    modelId?: unknown;
    apiKey?: unknown;
  };
  if (
    typeof body.vendorId !== "string" ||
    typeof body.modelId !== "string" ||
    typeof body.apiKey !== "string"
  ) {
    return NextResponse.json({ error: "需要平台、模型名称和 API key" }, { status: 400 });
  }
  const vendor = vendorById(body.vendorId);
  if (!vendor || !isKnownProviderBaseURL(vendor.baseURL)) {
    return NextResponse.json({ error: "未知平台" }, { status: 400 });
  }
  try {
    await assertProviderModel({
      baseURL: vendor.baseURL,
      apiKey: body.apiKey.trim(),
      modelId: body.modelId.trim(),
    });
    const model = await addWorkspaceModel({
      workspaceId: ctx.workspaceId,
      modelId: body.modelId,
      apiKey: body.apiKey,
      baseURL: vendor.baseURL,
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
  const role = await getMemberRole(authResult.session.user.id, ctx.workspaceId);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "无权管理模型" }, { status: 403 });
  }
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
