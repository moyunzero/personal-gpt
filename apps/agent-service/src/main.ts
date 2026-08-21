import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { ensureCheckpointerSetup } from "./graph/build-graph";
import { ensureAgentLangSmithEnv } from "./observability/langsmith";
import { applyOutboundProxyFromEnv, logOutboundProxyStatus } from "./observability/outbound-proxy";
import { parseCorsOrigins } from "./observability/cors-origins";

/** 兼容 nest dist/ 与源码路径，加载仓库根 .env（与 ingest-worker 一致） */
function loadRootEnv(): void {
  const candidates = [
    process.env.DOTENV_CONFIG_PATH,
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), ".env"),
    resolve(__dirname, "../../.env"),
    resolve(__dirname, "../../../.env"),
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    if (existsSync(path)) {
      loadEnv({ path });
      return;
    }
  }
}

loadRootEnv();
logOutboundProxyStatus(applyOutboundProxyFromEnv());
/**
 * agent-service 进程入口：LangGraph Agent SSE（AGENT-04）。
 * CORS：限制为 web origin（默认 http://localhost:3000）；禁止 credentials + 裸 "*"。
 */
async function bootstrap() {
  ensureAgentLangSmithEnv();

  // 生产环境：要求内部令牌，避免公网裸奔 agent-service（本地/MVP 演示可跳过）
  if (process.env.NODE_ENV === "production" && !process.env.AGENT_INTERNAL_TOKEN?.trim()) {
    throw new Error(
      "AGENT_INTERNAL_TOKEN is required in production (or keep agent-service on a private network only)",
    );
  }

  const app = await NestFactory.create(AppModule);

  // D-20/D-21：PostgresSaver.setup() 一次（Pitfall 5），禁止 per-request
  await ensureCheckpointerSetup();

  const origins = parseCorsOrigins(process.env.CORS_ORIGIN);

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  const port = process.env.AGENT_SERVICE_PORT ?? 3002;
  await app.listen(port);
}

bootstrap();
