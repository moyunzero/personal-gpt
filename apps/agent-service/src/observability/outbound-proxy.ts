/**
 * 让 Node fetch / undici（LangChain OpenAI SDK）走 HTTP(S)_PROXY。
 * macOS「系统代理」不会自动作用于 Nest/Node；Clash 需显式代理或 TUN。
 * 使用 EnvHttpProxyAgent 以尊重 NO_PROXY（本地环回不被代理）。
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

/** 启动日志：仅提示已启用，绝不打印 proxy URL / 凭据 / host / port */
export function logOutboundProxyStatus(proxy: string | null): void {
  if (!proxy) return;
  console.log("[agent-service] outbound proxy enabled");
}
