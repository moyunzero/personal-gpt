import {
  Controller,
  Get,
  Headers,
  Module,
  Query,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import type { Response } from "express";

import { authorizeMetricsScrape } from "@personal-gpt/shared/metrics-auth";

import { AgentModule } from "./agent/agent.module";
import { metricsContentType, metricsText } from "./metrics";

@Controller()
class HealthController {
  @Get("health")
  health() {
    return { status: "ok", service: "agent-service" };
  }

  @Get("metrics")
  async metrics(
    @Headers("authorization") authorization: string | undefined,
    @Query("token") token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!authorizeMetricsScrape(authorization, token)) {
      throw new UnauthorizedException("Unauthorized");
    }
    res.setHeader("Content-Type", metricsContentType());
    res.send(await metricsText());
  }
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AgentModule],
  controllers: [HealthController],
})
export class AppModule {}
