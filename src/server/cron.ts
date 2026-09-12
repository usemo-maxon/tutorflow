import "server-only";

import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization");
  if (!secret || !supplied) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
