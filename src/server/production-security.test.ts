import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { validSignature } from "@/app/api/webhooks/payu/route";
import { decryptSecret, encryptSecret } from "./crypto";
import { isAuthorizedCron } from "./cron";

afterEach(() => {
  delete process.env.PAYU_SECOND_KEY;
  delete process.env.CRON_SECRET;
  delete process.env.INTEGRATION_ENCRYPTION_KEY;
});

describe("production security boundaries", () => {
  it("accepts only the PayU signature calculated over the exact raw body", () => {
    process.env.PAYU_SECOND_KEY = "0123456789abcdef0123456789abcdef";
    const body = '{"order":{"orderId":"A","status":"COMPLETED"}}';
    const signature = createHash("md5")
      .update(body + process.env.PAYU_SECOND_KEY)
      .digest("hex");
    expect(
      validSignature(
        body,
        `sender=checkout;signature=${signature};algorithm=MD5;content=DOCUMENT`,
      ),
    ).toBe(true);
    expect(
      validSignature(`${body} `, `signature=${signature};algorithm=MD5`),
    ).toBe(false);
    expect(
      validSignature(body, `signature=${signature};algorithm=SHA256`),
    ).toBe(false);
  });

  it("requires an exact bearer token for cron endpoints", () => {
    process.env.CRON_SECRET = "a-strong-cron-secret-value";
    expect(
      isAuthorizedCron(
        new Request("https://example.test", {
          headers: { authorization: "Bearer a-strong-cron-secret-value" },
        }),
      ),
    ).toBe(true);
    expect(
      isAuthorizedCron(
        new Request("https://example.test", {
          headers: { authorization: "Bearer wrong" },
        }),
      ),
    ).toBe(false);
  });

  it("encrypts integration credentials with authenticated encryption", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64url",
    );
    const encrypted = encryptSecret({ refreshToken: "secret" });
    expect(encrypted).not.toContain("secret");
    expect(decryptSecret(encrypted)).toEqual({ refreshToken: "secret" });
    const parts = encrypted.split(".");
    const ciphertext = Buffer.from(parts[2], "base64url");
    ciphertext[0] ^= 1;
    parts[2] = ciphertext.toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});
