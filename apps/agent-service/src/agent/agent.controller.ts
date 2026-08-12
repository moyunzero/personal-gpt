import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Response } from "express";

import {
  AgentService,
  InvalidAgentBodyError,
  ModelConfigError,
} from "./agent.service";

/**
 * AGENT-04：POST /agent/chat → LangGraph UIMessage SSE。
 * 不再默认 fetch WEB_URL/api/chat（D-00b）。health 仍在 AppModule。
 */
@Controller("agent")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post("chat")
  async chat(
    @Body() body: unknown,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    try {
      await this.agentService.streamChat(
        (body ?? {}) as Record<string, unknown>,
        res,
      );
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
