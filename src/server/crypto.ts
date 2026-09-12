import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) throw new Error("INTEGRATION_ENCRYPTION_KEY is missing");
  const decoded = Buffer.from(raw, "base64url");
  if (decoded.length !== 32)
    throw new Error("INTEGRATION_ENCRYPTION_KEY must encode exactly 32 bytes");
  return decoded;
}

export function encryptSecret(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptSecret<T>(value: string): T {
  const [iv, tag, encrypted] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Encrypted value is invalid");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
      "utf8",
    ),
  ) as T;
}
