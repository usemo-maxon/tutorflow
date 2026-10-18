import "server-only";

import { ApiFailure } from "./errors";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) {
    throw new ApiFailure(403, { code: "INVALID_ORIGIN", message: "Nieprawidłowe źródło żądania." });
  }
  const originUrl = new URL(origin);
  if (originUrl.host !== host) {
    throw new ApiFailure(403, { code: "INVALID_ORIGIN", message: "Nieprawidłowe źródło żądania." });
  }
}

export function formString(form: FormData, key: string, max = 500): string {
  const value = form.get(key);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

