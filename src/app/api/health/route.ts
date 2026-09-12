import { createSupabaseAdminClient } from "@/server/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
  } catch (error) {
    console.error(
      "TutorFlow health check failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
