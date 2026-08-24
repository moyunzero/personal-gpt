import { headers } from "next/headers";

import { safeCallbackUrl } from "@/lib/auth/safe-callback-url";

/**
 * Intermediate magic-link page (D-34 UAT).
 * Gmail/SafeBrowsing often prefetch the Auth.js callback URL and burn the one-time token.
 * Email links here first; only the user click hits /api/auth/callback/nodemailer.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const token = first(params.token);
  const email = first(params.email);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (host?.includes("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
  const origin =
    host?.trim() ? `${proto}://${host.trim()}` : process.env.AUTH_URL?.trim() || "http://localhost:3000";
  const callbackUrl = safeCallbackUrl(first(params.callbackUrl) || "/", origin);
  const missing = !token || !email;

  const href = `/api/auth/callback/nodemailer?${new URLSearchParams({
    callbackUrl,
    token,
    email,
  }).toString()}`;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        background: "#0b0f14",
        color: "#e8eef5",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          border: "1px solid #243041",
          borderRadius: 12,
          padding: "28px 24px",
          background: "#121821",
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>完成登录</h1>
        <p style={{ margin: "0 0 20px", color: "#9aa8b8", lineHeight: 1.5 }}>
          {missing
            ? "链接无效或已过期，请返回重新获取登录邮件。"
            : "点击下方按钮完成登录（避免邮箱安全扫描提前消耗一次性链接）。"}
        </p>
        {missing ? (
          <a href="/api/auth/signin" style={{ color: "#7eb6ff" }}>
            返回登录
          </a>
        ) : (
          <a
            href={href}
            style={{
              display: "inline-block",
              background: "#346df1",
              color: "#fff",
              textDecoration: "none",
              padding: "10px 18px",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            确认登录
          </a>
        )}
      </div>
    </main>
  );
}
