/** Same-origin relative callback only — blocks open redirects after magic-link confirm. */
export function safeCallbackUrl(raw: string, origin: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "/") return "/";

  try {
    const url = new URL(trimmed, origin);
    if (url.origin !== origin) return "/";
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
      return trimmed.split(/[\r\n]/)[0] ?? "/";
    }
    return "/";
  }
}
