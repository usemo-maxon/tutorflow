import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntitlementSubscriptionRow } from "@/lib/entitlements";

export async function ownerLifetimeUserIds(
  supabase: SupabaseClient,
  userIds?: readonly string[],
): Promise<Set<string>> {
  if (userIds && userIds.length === 0) return new Set();
  let query = supabase
    .from("internal_access_grants")
    .select("user_id")
    .eq("grant_type", "owner_lifetime")
    .is("revoked_at", null);
  if (userIds) query = query.in("user_id", [...userIds]);
  const { data, error } = await query;
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.user_id as string));
}

export function applyOwnerLifetimeAccess<
  T extends EntitlementSubscriptionRow & { teacher_id: string },
>(rows: T[], owners: ReadonlySet<string>): T[] {
  return rows.map((row) =>
    owners.has(row.teacher_id)
      ? ({ ...row, accessGrant: "owner_lifetime" } as T)
      : row,
  );
}
