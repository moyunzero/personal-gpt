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

/**
 * AGENT-04：POST /agent/chat → LangGraph UIMessage SSE。
 * 可选 AGENT_INTERNAL_TOKEN：设置后需 Authorization: Bearer <token>（v2.x 临时护栏，正式身份见 v4）。
 */
@Controller("agent")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post("chat")
  async chat(
    @Body() body: unknown,
    @Headers("authorization") authorization: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const expected = process.env.AGENT_INTERNAL_TOKEN?.trim();
    if (expected && !bearerMatchesInternalToken(authorization, expected)) {
      throw new UnauthorizedException("Unauthorized: missing or invalid AGENT_INTERNAL_TOKEN");
    }

    try {
      await this.agentService.streamChat((body ?? {}) as Record<string, unknown>, res);
    } catch (err) {
      if (err instanceof InvalidAgentBodyError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof ModelConfigError) {
        throw new ServiceUnavailableException(err.message);
      }
      throw err;
    }
  }
}
