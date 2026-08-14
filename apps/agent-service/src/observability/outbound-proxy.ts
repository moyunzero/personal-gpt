/**
 * 让 Node fetch / undici（LangChain OpenAI SDK）走 HTTP(S)_PROXY。
 * macOS「系统代理」不会自动作用于 Nest/Node；Clash 需显式代理或 TUN。
 */
import { ProxyAgent, setGlobalDispatcher } from "undici";

export function applyOutboundProxyFromEnv(): string | null {
  const proxy =
    process.env.HTTPS_PROXY?.trim() ||
    process.env.https_proxy?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.http_proxy?.trim() ||
    "";
  if (!proxy) return null;
  setGlobalDispatcher(new ProxyAgent(proxy));
  return proxy;
}
