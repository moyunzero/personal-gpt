import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { ensureAgentLangSmithEnv } from "./observability/langsmith";
import { applyOutboundProxyFromEnv } from "./observability/outbound-proxy";

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
const outboundProxy = applyOutboundProxyFromEnv();
if (outboundProxy) {
  console.log(`[agent-service] outbound proxy → ${outboundProxy}`);
}
/**
 * agent-service 进程入口：LangGraph Agent SSE（AGENT-04）。
 * CORS：限制为 web origin（默认 http://localhost:3000）；禁止 credentials + 裸 "*"。
 */
async function bootstrap() {
  ensureAgentLangSmithEnv();

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
