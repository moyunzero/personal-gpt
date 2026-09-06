import Link from "next/link";

/**
 * Auth.js 错误页：把 Configuration / 邮件发送失败翻成可读中文（Resend 测试模式等）。
 */
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const code = (params.error ?? "").trim();

  const isEmailGate =
    code === "Configuration" ||
    code === "Verification" ||
    code === "EmailSignin" ||
    code.toLowerCase().includes("email");

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--color-bg, #0f1115)",
        color: "var(--color-ink, #f2f2f2)",
        fontFamily: "var(--font-body, system-ui, sans-serif)",
      }}
    >
      <section
        style={{
          maxWidth: 480,
          width: "100%",
          padding: "28px 24px",
          borderRadius: 12,
          background: "var(--color-surface, #1a1d24)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 600 }}>无法完成登录</h1>
        {isEmailGate ? (
          <>
            <p style={{ margin: "0 0 12px", lineHeight: 1.6, color: "rgba(255,255,255,0.78)" }}>
              多半是<strong>邮件服务仍处在 Resend 测试模式</strong>：只能向账号本人邮箱发魔法链接，
              其他邮箱会收到「Server error / server configuration」这类笼统失败。
            </p>
            <ol style={{ margin: "0 0 16px", paddingLeft: 20, lineHeight: 1.7, color: "rgba(255,255,255,0.78)" }}>
              <li>
                打开{" "}
                <a href="https://resend.com/domains" style={{ color: "#8ec8ff" }}>
                  resend.com/domains
                </a>{" "}
                验证你的域名
              </li>
              <li>
                把 Vercel 里的 <code>EMAIL_FROM</code> 改成该域名下的地址（例如{" "}
                <code>noreply@你的域名</code>）
              </li>
              <li>重新部署后再用其他邮箱登录</li>
            </ol>
          </>
        ) : (
          <p style={{ margin: "0 0 16px", lineHeight: 1.6, color: "rgba(255,255,255,0.78)" }}>
            登录失败{code ? `（错误码：${code}）` : ""}。请稍后重试；若持续失败，检查 AUTH_SECRET / 数据库是否可用。
          </p>
        )}
        <Link
          href="/api/auth/signin"
          style={{
            display: "inline-block",
            padding: "10px 16px",
            borderRadius: 8,
            background: "var(--color-primary, #c45c3e)",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          返回登录
        </Link>
      </section>
    </main>
  );
}
