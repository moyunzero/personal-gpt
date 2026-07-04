import { Controller, Get, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AgentModule } from "./agent/agent.module";

@Controller()
class HealthController {
  @Get("health")
  health() {
    return { status: "ok", service: "agent-service" };
  }
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AgentModule],
  controllers: [HealthController],
})
export class AppModule {}
