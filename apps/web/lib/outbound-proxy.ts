/**
 * 让 Node fetch / undici（AI SDK、Astra HTTP）走 HTTP(S)_PROXY。
 * 与 agent-service 行为对齐；Clash 系统代理不会自动作用于 Next.js。
 * 使用 EnvHttpProxyAgent 以尊重 NO_PROXY（否则 BFF→localhost:3002 会被误代理）。
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

export function applyOutboundProxyFromEnv(): string | null {
  const proxy =
    process.env.HTTPS_PROXY?.trim() ||
    process.env.https_proxy?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.http_proxy?.trim() ||
    "";
  if (!proxy) return null;
  setGlobalDispatcher(new EnvHttpProxyAgent());
  return proxy;
}

/** 启动日志：仅提示已启用，绝不打印 proxy URL / 凭据 */
export function logOutboundProxyStatus(proxy: string | null): void {
  if (!proxy) return;
  console.log("[web] outbound proxy enabled");
}
