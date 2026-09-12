import { isAuthorizedCron } from "@/server/cron";
import { updateStateAsAdmin } from "@/server/admin-state";
import { createSupabaseAdminClient } from "@/server/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request))
    return Response.json({ ok: false }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  await supabase
    .from("subscriptions")
    .update({
      status: "read_only",
      read_only: true,
      updated_at: now.toISOString(),
    })
    .eq("status", "trial")
    .lt("trial_ends_at", now.toISOString());
  await supabase
    .from("subscriptions")
    .update({
      status: "past_due",
      read_only: true,
      updated_at: now.toISOString(),
    })
    .eq("status", "active")
    .lt("renews_at", now.toISOString());

  const { data: states } = await supabase
    .from("teacher_states")
    .select("teacher_id,state");
  let transitioned = 0;
  for (const row of states ?? []) {
    const lessons =
      (
        row.state as {
          lessons?: Array<{
            status: string;
            startsAt: string;
            durationMinutes: number;
          }>;
        }
      ).lessons ?? [];
    if (
      !lessons.some(
        (lesson) =>
          lesson.status === "scheduled" &&
          new Date(lesson.startsAt).getTime() +
            lesson.durationMinutes * 60_000 <
            now.getTime(),
      )
    )
      continue;
    await updateStateAsAdmin(row.teacher_id, (state) => {
      state.lessons.forEach((lesson) => {
        if (
          lesson.status === "scheduled" &&
          new Date(lesson.startsAt).getTime() +
            lesson.durationMinutes * 60_000 <
            now.getTime()
        ) {
          lesson.status = "needs_completion";
          transitioned += 1;
        }
      });
    });
  }

  const { data: expired } = await supabase
    .from("attachments")
    .select("id,object_path")
    .lt("expires_at", now.toISOString())
    .limit(500);
  const paths = (expired ?? []).map((item) => item.object_path);
  if (paths.length) {
    const { error: storageError } = await supabase.storage
      .from("attachments")
      .remove(paths);
    if (!storageError)
      await supabase
        .from("attachments")
        .delete()
        .in(
          "id",
          (expired ?? []).map((item) => item.id),
        );
  }
  return Response.json({
    ok: true,
    lessonsTransitioned: transitioned,
    attachmentsRemoved: paths.length,
  });
}
