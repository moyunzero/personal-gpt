import "dotenv/config";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/**
 * ingest-worker 进程入口：消费 BullMQ ingest 队列。
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.INGEST_WORKER_PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
