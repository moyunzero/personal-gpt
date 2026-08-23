import { Controller, Get, Module, Res } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import type { Response } from "express";

import { AgentModule } from "./agent/agent.module";
import { metricsContentType, metricsText } from "./metrics";

@Controller()
class HealthController {
  @Get("health")
  health() {
    return { status: "ok", service: "agent-service" };
  }

  @Get("metrics")
  async metrics(@Res() res: Response): Promise<void> {
    res.setHeader("Content-Type", metricsContentType());
    res.send(await metricsText());
  }
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AgentModule],
  controllers: [HealthController],
})
export class AppModule {}
