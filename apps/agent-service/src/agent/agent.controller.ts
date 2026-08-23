import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Response } from "express";

import { AgentService, InvalidAgentBodyError, ModelConfigError } from "./agent.service";
import { bearerMatchesInternalToken } from "./internal-token";
import { parseRetrievalContextFromHeaders } from "./retrieval-context";

/**
 * AGENT-04：POST /agent/chat → LangGraph UIMessage SSE。
 * 非生产：AGENT_INTERNAL_TOKEN 可选（设置后才校验）。
 * 生产：必须配置非空令牌，缺失或无效一律 401（fail-closed）。
 */
@Controller("agent")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post("chat")
  async chat(
    @Body() body: unknown,
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-user-id") xUserId: string | undefined,
    @Headers("x-workspace-id") xWorkspaceId: string | undefined,
    @Headers("x-allowed-document-ids") xAllowedDocumentIds: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const expected = process.env.AGENT_INTERNAL_TOKEN?.trim();
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) {
      if (!expected || !bearerMatchesInternalToken(authorization, expected)) {
        throw new UnauthorizedException("Unauthorized: missing or invalid AGENT_INTERNAL_TOKEN");
      }
    } else if (expected && !bearerMatchesInternalToken(authorization, expected)) {
      throw new UnauthorizedException("Unauthorized: missing or invalid AGENT_INTERNAL_TOKEN");
    }

    const bodyRecord = (body ?? {}) as Record<string, unknown>;
    const fallbackWorkspace =
      typeof bodyRecord.workspaceId === "string" ? bodyRecord.workspaceId : undefined;
    const fallbackUserKey =
      typeof bodyRecord.userKey === "string" ? bodyRecord.userKey : undefined;
    const retrievalCtx = parseRetrievalContextFromHeaders(
      {
        "x-user-id": xUserId,
        "x-workspace-id": xWorkspaceId,
        "x-allowed-document-ids": xAllowedDocumentIds,
      },
      { workspaceId: fallbackWorkspace, userId: fallbackUserKey },
    );

    try {
      await this.agentService.streamChat(bodyRecord, res, retrievalCtx);
    } catch (err) {
      if (err instanceof InvalidAgentBodyError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof ModelConfigError) {
        throw new ServiceUnavailableException(err.message);
      }
      // SSE 已写出后勿再交给 Nest 异常过滤器（会二次写头 / 破坏流）
      if (res.headersSent) {
        console.error("[agent] streamChat failed after headers sent", err);
        return;
      }
      throw err;
    }
  }
}
