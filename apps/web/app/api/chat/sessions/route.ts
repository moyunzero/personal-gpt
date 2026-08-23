import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { resolveRetrievalContext } from "@/lib/auth/acl-resolver";
import { requireSession } from "@/lib/auth/session";
import {
  createChatSession,
  deleteChatSession,
  getSessionMessages,
  listChatSessions,
} from "@/lib/chat/chat-session.service";
import { runApiGuards } from "@/lib/middleware/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/chat/sessions — list sessions; ?id=&messages=1 returns message history */
export async function GET(req: Request) {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;

  const ctx = await resolveRetrievalContext(authResult.session);
  const requestId = randomUUID();

  return runApiGuards(
    req,
    { userId: ctx.userId, workspaceId: ctx.workspaceId, requestId },
    async () => {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get("id")?.trim();

      if (sessionId && url.searchParams.get("messages") === "1") {
        const sessions = await listChatSessions(ctx.userId, ctx.workspaceId);
        const session = sessions.find((s) => s.id === sessionId);
        if (!session) {
          return NextResponse.json({ error: "Session not found" }, { status: 404 });
        }
        const messages = await getSessionMessages(sessionId);
        return NextResponse.json({
          session: {
            id: session.id,
            threadId: session.threadId,
            title: session.title,
            mode: session.mode,
          },
          messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          })),
        });
      }

      const sessions = await listChatSessions(ctx.userId, ctx.workspaceId);
      return NextResponse.json({
        sessions: sessions.map((s) => ({
          id: s.id,
          threadId: s.threadId,
          mode: s.mode,
          title: s.title,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
      });
    },
    "chat",
  );
}

/** POST /api/chat/sessions — create session and return thread_id (D-24) */
export async function POST(req: Request) {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;

  const ctx = await resolveRetrievalContext(authResult.session);
  const requestId = randomUUID();

  return runApiGuards(
    req,
    { userId: ctx.userId, workspaceId: ctx.workspaceId, requestId },
    async () => {
      let mode: "chat" | "agent" = "chat";
      let title: string | undefined;
      try {
        const body = (await req.json()) as { mode?: unknown; title?: unknown };
        if (body.mode === "agent" || body.mode === "chat") mode = body.mode;
        if (typeof body.title === "string") title = body.title;
      } catch {
        /* empty body ok */
      }

      const session = await createChatSession({
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        mode,
        title,
      });

      return NextResponse.json({
        id: session.id,
        threadId: session.threadId,
        mode: session.mode,
        title: session.title,
      });
    },
    "chat",
  );
}

/** DELETE /api/chat/sessions?id= — delete single session (D-25) */
export async function DELETE(req: Request) {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;

  const ctx = await resolveRetrievalContext(authResult.session);
  const requestId = randomUUID();

  return runApiGuards(
    req,
    { userId: ctx.userId, workspaceId: ctx.workspaceId, requestId },
    async () => {
      const sessionId = new URL(req.url).searchParams.get("id")?.trim();
      if (!sessionId) {
        return NextResponse.json({ error: "Missing id query param" }, { status: 400 });
      }

      const deleted = await deleteChatSession(sessionId, ctx.userId, ctx.workspaceId);
      if (!deleted) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    },
    "chat",
  );
}
