import type { UIMessage } from "ai";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { isKnownProviderBaseURL } from "@personal-gpt/shared/ai/model-presets";

import { resolveWorkspaceId } from "../rag/retrieve";

export class InvalidAgentBodyError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "InvalidAgentBodyError";
  }
}

export type AgentChatBody = {
  messages?: unknown;
  thread_id?: unknown;
  workspaceId?: unknown;
  userKey?: unknown;
};

export type ParsedAgentChat = {
  messages: UIMessage[];
  threadId: string;
  workspaceId: string;
  userKey: string;
  model?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
};

const AgentUiMessagePartSchema = z
  .object({
    type: z.string().min(1),
  })
  .passthrough();

/** Reject role "system" — clients must not inject SystemMessage via toBaseMessages. */
const AgentUiMessageSchema = z
  .object({
    role: z.enum(["user", "assistant", "tool"]),
    parts: z.array(AgentUiMessagePartSchema).optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    if (!Array.isArray(val.parts) || val.parts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "parts must be a non-empty array",
        path: ["parts"],
      });
    }
  });

const AgentChatBodySchema = z.object({
  messages: z.array(AgentUiMessageSchema).min(1),
  thread_id: z.string().optional().nullable(),
  workspaceId: z.string().optional().nullable(),
  userKey: z.string().optional().nullable(),
  model: z.string().max(128).optional(),
  llmApiKey: z.string().max(512).optional(),
  llmBaseUrl: z.string().max(256).optional(),
});

const SAFE_THREAD_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/** 校验 POST /agent/chat body；非法抛 InvalidAgentBodyError（→ 400） */
export function parseAgentChatBody(body: unknown): ParsedAgentChat {
  const result = AgentChatBodySchema.safeParse(body ?? {});
  if (!result.success) {
    throw new InvalidAgentBodyError("Invalid body: messages must be an array of message objects");
  }

  const { messages, thread_id, workspaceId, userKey, model, llmApiKey, llmBaseUrl } = result.data;
  const trimmedThread = typeof thread_id === "string" ? thread_id.trim() : "";
  if (trimmedThread && !SAFE_THREAD_ID.test(trimmedThread)) {
    throw new InvalidAgentBodyError(
      "Invalid body: thread_id must be a safe id (letters, digits, _.:-; max 128)",
    );
  }
  const threadRaw = trimmedThread || randomUUID();
  const workspaceRaw =
    typeof workspaceId === "string" && workspaceId.trim() ? workspaceId.trim() : "default";
  const userKeyRaw =
    typeof userKey === "string" && userKey.trim() ? userKey.trim().slice(0, 128) : "anonymous";

  return {
    messages: messages as unknown as UIMessage[],
    threadId: threadRaw,
    workspaceId: resolveWorkspaceId(workspaceRaw),
    userKey: userKeyRaw,
    ...(model?.trim() ? { model: model.trim() } : {}),
    ...(llmApiKey ? { llmApiKey } : {}),
    ...(llmBaseUrl && isKnownProviderBaseURL(llmBaseUrl) ? { llmBaseUrl } : {}),
  };
}
