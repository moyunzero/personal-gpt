import "dotenv/config";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

/**
 * agent-service 进程入口：LangGraph Agent SSE（AGENT-04）。
 * CORS：限制为 web origin（默认 http://localhost:3000）；禁止 credentials + 裸 "*"。
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  });

  const port = process.env.AGENT_SERVICE_PORT ?? 3002;
  await app.listen(port);
}

bootstrap();
