import "server-only";

import type { Teacher } from "@/lib/domain";
import {
  activeStudentLimit,
  hasEntitlement,
  resolveEntitlements,
  type EntitlementSubscriptionRow,
  type Entitlements,
  type BooleanEntitlement,
} from "@/lib/entitlements";
import { ApiFailure } from "./errors";

export function planRequired(capability: keyof Entitlements): ApiFailure {
  return new ApiFailure(403, {
    code: "PLAN_REQUIRED",
    message: "Ta funkcja jest dostępna w planie Premium.",
    details: { capability },
  });
}

export function planLimitReached(
  resource: string,
  limit: number,
  message: string,
): ApiFailure {
  return new ApiFailure(403, {
    code: "PLAN_LIMIT_REACHED",
    message,
    details: { limit, resource },
  });
}

export function assertEntitlement(
  subscription: Pick<
    Teacher["subscription"],
    "status" | "tier" | "accessGrant"
  >,
  capability: BooleanEntitlement,
): void {
  if (!hasEntitlement(subscription, capability)) throw planRequired(capability);
}

export function assertActiveStudentCapacity(
  subscription: Pick<
    Teacher["subscription"],
    "status" | "tier" | "accessGrant"
  >,
  activeStudents: number,
): void {
  const limit = activeStudentLimit(subscription);
  if (limit !== null && activeStudents >= limit) {
    throw new ApiFailure(403, {
      code: "PLAN_LIMIT_REACHED",
      message: `Plan Free pozwala na maksymalnie ${limit} aktywnych uczniów.`,
      details: { limit, resource: "active_students" },
    });
  }
}

export function entitledTeacherIds(
  rows: Array<EntitlementSubscriptionRow & { teacher_id: string }>,
  capability: BooleanEntitlement,
): Set<string> {
  return new Set(
    rows
      .filter((row) => resolveEntitlements(row)[capability])
      .map((row) => row.teacher_id),
  );
}
