import "server-only";

import { notFound } from "next/navigation";
import {
  ADMIN_PAGE_SIZE,
  hasAdminPermission,
  type AdminPermission,
  type PlatformAdminRole,
} from "@/lib/admin";
import {
  FOUNDER_MONTHLY_PRICE_GROSZ,
  PRO_ANNUAL_PRICE_GROSZ,
  PRO_MONTHLY_PRICE_GROSZ,
} from "@/lib/pricing";
import { currentTeacher } from "./auth";
import { isSupabaseConfigured } from "./env";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "./supabase";

export type PlatformAdminContext = {
  userId: string;
  role: PlatformAdminRole;
  can: (permission: AdminPermission) => boolean;
};

export async function requirePlatformAdmin(
  permission?: AdminPermission,
): Promise<PlatformAdminContext> {
  const teacher = await currentTeacher();
  if (!teacher?.isPlatformAdmin) notFound();

  let role: PlatformAdminRole = "platform_owner";
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "current_user_platform_admin_role",
    );
    if (error || !isPlatformAdminRole(data)) notFound();
    role = data;
  }
  if (permission && !hasAdminPermission(role, permission)) notFound();
  return {
    userId: teacher.id,
    role,
    can: (candidate) => hasAdminPermission(role, candidate),
  };
}

function isPlatformAdminRole(value: unknown): value is PlatformAdminRole {
  return (
    value === "platform_owner" ||
    value === "platform_admin" ||
    value === "support_moderator"
  );
}

export async function getAdminOverview() {
  const admin = await requirePlatformAdmin("overview.read");
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const sevenDays = new Date(now.getTime() - 7 * 86_400_000);
  const thirtyDays = new Date(now.getTime() - 30 * 86_400_000);

  const [
    totalUsers,
    todayUsers,
    sevenDayUsers,
    thirtyDayUsers,
    subscriptions,
    successfulPayments,
    failedPayments,
    tickets,
    events,
    audits,
    owners,
  ] = await Promise.all([
    countRows(supabase, "profiles"),
    countRows(supabase, "profiles", { gte: ["created_at", today.toISOString()] }),
    countRows(supabase, "profiles", { gte: ["created_at", sevenDays.toISOString()] }),
    countRows(supabase, "profiles", { gte: ["created_at", thirtyDays.toISOString()] }),
    supabase
      .from("subscriptions")
      .select("teacher_id,status,tier,plan,billing_interval")
      .in("status", ["active", "trial"]),
    countRows(supabase, "payu_orders", { eq: [["status", "completed"]] }),
    countRows(supabase, "payu_orders", { in: ["status", ["failed", "cancelled"]] }),
    supabase
      .from("support_tickets")
      .select("id,subject,status,priority,updated_at")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("platform_operational_events")
      .select("id,event_type,severity,service,status,summary,occurred_at")
      .in("status", ["open", "retrying"])
      .order("occurred_at", { ascending: false })
      .limit(5),
    supabase
      .from("platform_admin_audit_logs")
      .select("id,action,target_type,target_id,occurred_at,succeeded")
      .order("occurred_at", { ascending: false })
      .limit(6),
    supabase
      .from("internal_access_grants")
      .select("user_id")
      .eq("grant_type", "owner_lifetime")
      .is("revoked_at", null),
  ]);

  const ownerIds = new Set((owners.data ?? []).map((row) => row.user_id));
  const rows = subscriptions.data ?? [];
  const paidRows = rows.filter(
    (row) =>
      row.status === "active" &&
      row.tier !== "free" &&
      !ownerIds.has(row.teacher_id),
  );
  const mrrGrosz = paidRows.reduce((sum, row) => {
    if (row.tier === "founder" || row.plan === "founder") {
      return sum + FOUNDER_MONTHLY_PRICE_GROSZ;
    }
    return (
      sum +
      (row.billing_interval === "annual" || row.plan === "annual"
        ? Math.round(PRO_ANNUAL_PRICE_GROSZ / 12)
        : PRO_MONTHLY_PRICE_GROSZ)
    );
  }, 0);

  return {
    admin,
    metrics: {
      totalUsers,
      activeUsers: null as number | null,
      todayUsers,
      sevenDayUsers,
      thirtyDayUsers,
      free: rows.filter((row) => row.tier === "free" && row.status !== "trial")
        .length,
      pro: rows.filter((row) => row.tier === "pro").length,
      founder: rows.filter((row) => row.tier === "founder").length,
      lifetime: ownerIds.size,
      activePaid: paidRows.length,
      mrrGrosz,
      arrGrosz: mrrGrosz * 12,
      successfulPayments,
      failedPayments,
    },
    recentTickets: tickets.data ?? [],
    recentEvents: events.data ?? [],
    recentAudits: audits.data ?? [],
  };
}

async function countRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: string,
  filter?: {
    eq?: Array<[string, string | number | boolean]>;
    gte?: [string, string];
    in?: [string, readonly (string | number)[]];
  },
): Promise<number> {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of filter?.eq ?? []) query = query.eq(column, value);
  if (filter?.gte) query = query.gte(filter.gte[0], filter.gte[1]);
  if (filter?.in) query = query.in(filter.in[0], [...filter.in[1]]);
  const { count, error } = await query;
  if (error) {
    throw new Error(`Admin count failed for ${table}: ${error.message}`);
  }
  return count ?? 0;
}

export async function getAdminUsers(options: {
  page?: number;
  query?: string;
  plan?: string;
  status?: string;
}) {
  const admin = await requirePlatformAdmin("users.read");
  const supabase = createSupabaseAdminClient();
  const page = Math.max(1, options.page ?? 1);
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
    page,
    perPage: ADMIN_PAGE_SIZE,
  });
  if (authError) throw authError;
  let users = authData.users;
  const normalizedQuery = options.query?.trim().toLocaleLowerCase("pl-PL");
  if (normalizedQuery) {
    users = users.filter(
      (user) =>
        user.id.toLowerCase().includes(normalizedQuery) ||
        user.email?.toLocaleLowerCase("pl-PL").includes(normalizedQuery),
    );
  }
  const ids = users.map((user) => user.id);
  const [profiles, subscriptions, suspensions, grants, usage] =
    await Promise.all([
      ids.length
        ? supabase.from("profiles").select("id,full_name").in("id", ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase
            .from("subscriptions")
            .select("teacher_id,status,tier,plan,billing_interval,renews_at")
            .in("teacher_id", ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase
            .from("account_suspensions")
            .select("user_id,suspended_at,reason")
            .in("user_id", ids)
            .is("restored_at", null)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase
            .from("internal_access_grants")
            .select("user_id")
            .in("user_id", ids)
            .is("revoked_at", null)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.rpc("platform_admin_user_usage", {
            actor_user_id: admin.userId,
            target_user_ids: ids,
          })
        : Promise.resolve({ data: [] }),
    ]);
  const profileById = new Map(
    (profiles.data ?? []).map((row) => [row.id, row]),
  );
  const subscriptionById = new Map(
    (subscriptions.data ?? []).map((row) => [row.teacher_id, row]),
  );
  const suspendedIds = new Set(
    (suspensions.data ?? []).map((row) => row.user_id),
  );
  const ownerIds = new Set((grants.data ?? []).map((row) => row.user_id));
  const usageRows = (usage.data ?? []) as Array<{
    user_id: string;
    active_students: number | string;
    lessons: number | string;
  }>;
  const usageById = new Map(usageRows.map((row) => [row.user_id, row]));
  const rows = users.map((user) => ({
    id: user.id,
    email: user.email ?? "—",
    name: profileById.get(user.id)?.full_name || "—",
    createdAt: user.created_at,
    confirmedAt: user.email_confirmed_at ?? null,
    lastActivityAt: user.last_sign_in_at ?? null,
    subscription: subscriptionById.get(user.id) ?? null,
    suspended: suspendedIds.has(user.id),
    ownerLifetime: ownerIds.has(user.id),
    activeStudents: Number(usageById.get(user.id)?.active_students ?? 0),
    lessons: Number(usageById.get(user.id)?.lessons ?? 0),
  }));
  return {
    admin,
    page,
    hasNextPage: authData.users.length === ADMIN_PAGE_SIZE,
    users: rows.filter((row) => {
      if (options.plan && options.plan !== "all") {
        if (options.plan === "lifetime") return row.ownerLifetime;
        if (row.subscription?.tier !== options.plan) return false;
      }
      if (options.status === "suspended" && !row.suspended) return false;
      if (options.status === "active" && row.suspended) return false;
      return true;
    }),
  };
}

export async function getAdminUser(userId: string) {
  const admin = await requirePlatformAdmin("users.read");
  const supabase = createSupabaseAdminClient();
  const { data: authUser, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !authUser.user) notFound();
  const [profile, subscription, suspension, override, grants, memberships, orders, audits, usage] =
    await Promise.all([
      supabase.from("profiles").select("id,email,full_name,timezone,created_at").eq("id", userId).maybeSingle(),
      supabase.from("subscriptions").select("teacher_id,status,tier,plan,billing_interval,read_only,trial_ends_at,renews_at,updated_at").eq("teacher_id", userId).maybeSingle(),
      supabase.from("account_suspensions").select("*").eq("user_id", userId).is("restored_at", null).maybeSingle(),
      supabase.from("subscription_overrides").select("*").eq("user_id", userId).is("revoked_at", null).maybeSingle(),
      supabase.from("internal_access_grants").select("grant_type,granted_at,revoked_at").eq("user_id", userId),
      supabase.from("workspace_members").select("workspace_id,role,status,created_at").eq("user_id", userId),
      supabase.from("payu_orders").select("id,ext_order_id,amount_grosz,status,plan,created_at,updated_at").eq("teacher_id", userId).order("created_at", { ascending: false }).limit(25),
      supabase.from("platform_admin_audit_logs").select("id,action,reason,occurred_at,succeeded").eq("target_id", userId).order("occurred_at", { ascending: false }).limit(25),
      supabase.rpc("platform_admin_user_usage", {
        actor_user_id: admin.userId,
        target_user_ids: [userId],
      }),
    ]);
  const usageRow = usage.data?.[0];
  return {
    admin,
    user: authUser.user,
    profile: profile.data,
    subscription: subscription.data,
    suspension: suspension.data,
    override: override.data,
    grants: grants.data ?? [],
    memberships: memberships.data ?? [],
    orders: orders.data ?? [],
    audits: audits.data ?? [],
    usage: {
      activeStudents: Number(usageRow?.active_students ?? 0),
      lessons: Number(usageRow?.lessons ?? 0),
    },
  };
}

export async function getAdminCollection<Row extends Record<string, unknown>>(
  permission: AdminPermission,
  table: string,
  columns: string,
  options: { page?: number; order?: string; ascending?: boolean } = {},
) {
  const admin = await requirePlatformAdmin(permission);
  const supabase = createSupabaseAdminClient();
  const page = Math.max(1, options.page ?? 1);
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  const to = from + ADMIN_PAGE_SIZE - 1;
  const { data, error, count } = await supabase
    .from(table)
    .select(columns, { count: "exact" })
    .order(options.order ?? "created_at", {
      ascending: options.ascending ?? false,
    })
    .range(from, to);
  if (error) throw error;
  return {
    admin,
    rows: (data ?? []) as unknown as Row[],
    count: count ?? 0,
    page,
  };
}

export async function getAdminSupportTicket(ticketId: string) {
  const admin = await requirePlatformAdmin("support.read");
  const supabase = createSupabaseAdminClient();
  const [ticket, messages] = await Promise.all([
    supabase.from("support_tickets").select("*").eq("id", ticketId).maybeSingle(),
    supabase.from("support_ticket_messages").select("id,author_user_id,body,internal_note,created_at").eq("ticket_id", ticketId).order("created_at"),
  ]);
  if (ticket.error || !ticket.data) notFound();
  if (messages.error) throw messages.error;
  return { admin, ticket: ticket.data, messages: messages.data ?? [] };
}

export async function getPlatformAdministrators() {
  const admin = await requirePlatformAdmin("settings.read");
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("platform_admins").select("user_id,role,status,granted_at,granted_by,reason,revoked_at").order("granted_at", { ascending: false });
  if (error) throw error;
  return { admin, rows: data ?? [] };
}

