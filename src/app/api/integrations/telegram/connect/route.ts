import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { currentTeacher } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase";

export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) redirect("/logowanie");
  const username = process.env.TELEGRAM_BOT_USERNAME;
  if (!username) redirect("/app/ustawienia/integracje?telegram=unavailable");
  const code = randomBytes(18).toString("base64url");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("telegram_link_codes").insert({
    code_hash: createHash("sha256").update(code).digest("hex"),
    teacher_id: teacher.id,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  if (error) redirect("/app/ustawienia/integracje?telegram=error");
  redirect(
    `https://t.me/${encodeURIComponent(username.replace(/^@/, ""))}?start=${code}`,
  );
}
