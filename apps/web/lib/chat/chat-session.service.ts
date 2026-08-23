import { createThreadId, SAFE_THREAD_ID_PATTERN } from "@/lib/chat/thread-id";
import { getDataSource } from "@/lib/db/get-data-source";
import { ChatMessageEntity } from "@/lib/db/entities/chat-message.entity";
import {
  ChatSessionEntity,
  type ChatSessionMode,
} from "@/lib/db/entities/chat-session.entity";

export { SAFE_THREAD_ID_PATTERN };

export class ThreadOwnershipError extends Error {
  constructor(message = "Forbidden: thread_id does not belong to this user") {
    super(message);
    this.name = "ThreadOwnershipError";
  }
}

function titleFromContent(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

export async function createChatSession(params: {
  userId: string;
  workspaceId: string;
  mode?: ChatSessionMode;
  title?: string;
  threadId?: string;
}): Promise<ChatSessionEntity> {
  const ds = await getDataSource();
  const repo = ds.getRepository(ChatSessionEntity);
  const session = repo.create({
    threadId: params.threadId?.trim() || createThreadId(),
    userId: params.userId,
    workspaceId: params.workspaceId,
    mode: params.mode ?? "chat",
    title: params.title?.trim() || "New chat",
  });
  return repo.save(session);
}

export async function findSessionByThreadId(threadId: string): Promise<ChatSessionEntity | null> {
  const ds = await getDataSource();
  return ds.getRepository(ChatSessionEntity).findOne({ where: { threadId } });
}

/** D-30: reject foreign thread_id before agent/checkpoint access */
export async function assertThreadOwnership(
  threadId: string,
  userId: string,
  workspaceId: string,
): Promise<ChatSessionEntity> {
  const trimmed = threadId.trim();
  if (!trimmed || !SAFE_THREAD_ID_PATTERN.test(trimmed)) {
    throw new ThreadOwnershipError("Invalid thread_id");
  }
  const session = await findSessionByThreadId(trimmed);
  if (!session || session.userId !== userId || session.workspaceId !== workspaceId) {
    throw new ThreadOwnershipError();
  }
  return session;
}

/** Ensure server-backed session row exists for client thread_id (D-24). */
export async function ensureChatSession(params: {
  threadId: string;
  userId: string;
  workspaceId: string;
  mode: ChatSessionMode;
}): Promise<ChatSessionEntity> {
  const existing = await findSessionByThreadId(params.threadId);
  if (existing) {
    if (existing.userId !== params.userId || existing.workspaceId !== params.workspaceId) {
      throw new ThreadOwnershipError();
    }
    return existing;
  }
  return createChatSession({
    threadId: params.threadId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    mode: params.mode,
  });
}

export async function listChatSessions(
  userId: string,
  workspaceId: string,
): Promise<ChatSessionEntity[]> {
  const ds = await getDataSource();
  return ds.getRepository(ChatSessionEntity).find({
    where: { userId, workspaceId },
    order: { updatedAt: "DESC" },
    take: 100,
  });
}

export async function deleteChatSession(
  sessionId: string,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const ds = await getDataSource();
  const repo = ds.getRepository(ChatSessionEntity);
  const session = await repo.findOne({ where: { id: sessionId, userId, workspaceId } });
  if (!session) return false;
  await repo.remove(session);
  return true;
}

/** D-23: persist turn after stream completes */
export async function persistChatTurn(params: {
  session: ChatSessionEntity;
  userContent: string;
  assistantContent: string;
}): Promise<void> {
  const ds = await getDataSource();
  const messageRepo = ds.getRepository(ChatMessageEntity);
  const sessionRepo = ds.getRepository(ChatSessionEntity);

  await messageRepo.save([
    messageRepo.create({
      sessionId: params.session.id,
      role: "user",
      content: params.userContent,
    }),
    messageRepo.create({
      sessionId: params.session.id,
      role: "assistant",
      content: params.assistantContent,
    }),
  ]);

  if (!params.session.title || params.session.title === "New chat") {
    params.session.title = titleFromContent(params.userContent);
  }
  params.session.updatedAt = new Date();
  await sessionRepo.save(params.session);
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessageEntity[]> {
  const ds = await getDataSource();
  return ds.getRepository(ChatMessageEntity).find({
    where: { sessionId },
    order: { createdAt: "ASC" },
  });
}
