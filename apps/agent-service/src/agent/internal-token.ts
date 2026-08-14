import { timingSafeEqual } from "node:crypto";

/**
 * 校验 Authorization: Bearer <token> 是否匹配 AGENT_INTERNAL_TOKEN。
 * 长度不等直接拒绝；等长时用 timingSafeEqual，避免简单字符串比对的计时侧信道。
 */
export function bearerMatchesInternalToken(
  authorization: string | undefined,
  expected: string,
): boolean {
  const got = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!got) return false;
  const a = Buffer.from(got, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
