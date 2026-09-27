import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const PREFIX = "enc1:";

function appSecret(): string | undefined {
  const value =
    process.env.WORKSPACE_MODEL_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();
  if (!value || value === "ci-build-placeholder") return undefined;
  return value;
}

function secretKey(): Buffer | undefined {
  const secret = appSecret();
  if (!secret) return undefined;
  return scryptSync(secret, "workspace-llm-model", 32);
}

/** Encrypt with the application secret. Refuses to return plaintext when none is set. */
export function sealModelKey(plain: string): string {
  const key = secretKey();
  if (!key) {
    throw new Error("未配置 WORKSPACE_MODEL_SECRET，拒绝保存模型密钥");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${data.toString("base64url")}`;
}

/** Decrypt ciphertext. Plaintext is returned unchanged so rows written before encryption still work. */
export function openModelKey(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const key = secretKey();
  if (!key) {
    throw new Error("无法读取已保存的模型密钥");
  }
  const body = stored.slice(PREFIX.length);
  const [ivPart, tagPart, dataPart] = body.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("无法读取已保存的模型密钥");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
