/**
 * Agent 模式 BFF：浏览器 → Next `/api/agent/chat` → agent-service。
 * 注入 AGENT_INTERNAL_TOKEN（若配置），避免把密钥暴露到 NEXT_PUBLIC_*。
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function agentUpstreamUrl(): string {
  const base = (
    process.env.AGENT_SERVICE_URL ||
    process.env.NEXT_PUBLIC_AGENT_SERVICE_URL ||
    "http://localhost:3002"
  ).replace(/\/$/, "");
  return `${base}/agent/chat`;
}

export async function POST(req: Request) {
  const upstream = agentUpstreamUrl();
  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const token = process.env.AGENT_INTERNAL_TOKEN?.trim();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      method: "POST",
      headers,
      body: await req.arrayBuffer(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `agent-service 不可达：${message}` }, { status: 502 });
  }

  const outHeaders = new Headers();
  const pass = ["content-type", "x-vercel-ai-ui-message-stream", "cache-control"];
  for (const key of pass) {
    const v = upstreamRes.headers.get(key);
    if (v) outHeaders.set(key, v);
  }

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}
