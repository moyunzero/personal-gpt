import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/**
 * ingest-worker 进程入口。
 * Phase 1 仅提供健康检查占位；BullMQ 消费逻辑在后续 plan 实现。
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.INGEST_WORKER_PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
