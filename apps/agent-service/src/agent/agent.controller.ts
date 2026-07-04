import { Body, Controller, Post, Req, Res, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** 将 fetch ReadableStream 转为 Node Readable 以便 pipe 到 Express */
function webStreamToNode(stream: ReadableStream<Uint8Array>): Readable {
  const reader = stream.getReader();
  return new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        this.push(Buffer.from(value));
      } catch (error) {
        this.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
}

/**
 * Phase 1 透传代理（ENG-03 / D-00c）：不修改 body，SSE 原样 pipe。
 * WEB_URL 仅来自 env，不读用户 header（T-01-20）。
 */
@Controller("agent")
export class AgentController {
  constructor(private readonly config: ConfigService) {}

  @Post("chat")
  async chat(@Req() req: Request, @Res() res: Response, @Body() body: unknown): Promise<void> {
    const webUrl = this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
    const upstreamUrl = `${webUrl.replace(/\/$/, "")}/api/chat`;

    const proxyKey = this.config.get<string>("INTERNAL_PROXY_KEY");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (proxyKey) {
      headers["X-Internal-Proxy-Key"] = proxyKey;
    }

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    res.status(upstream.status);

    const contentType = upstream.headers.get("content-type") ?? "text/event-stream";
    res.setHeader("Content-Type", contentType);

    const cacheControl = upstream.headers.get("cache-control");
    if (cacheControl) {
      res.setHeader("Cache-Control", cacheControl);
    }

    if (!upstream.body) {
      if (!upstream.ok) {
        const text = await upstream.text();
        res.send(text);
        return;
      }
      throw new ServiceUnavailableException("Upstream returned empty body");
    }

    await pipeline(webStreamToNode(upstream.body), res);
  }
}
