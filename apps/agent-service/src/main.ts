import "dotenv/config";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

/**
 * agent-service 进程入口：Phase 1 透传 POST /agent/chat → web /api/chat。
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.AGENT_SERVICE_PORT ?? 3002;
  await app.listen(port);
}

bootstrap();
