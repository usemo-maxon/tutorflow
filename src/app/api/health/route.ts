import { createSupabaseAdminClient } from "@/server/supabase";
import { serverEnv } from "@/server/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    serverEnv();
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) throw error;
    return Response.json(
      { status: "ok", database: "reachable" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
