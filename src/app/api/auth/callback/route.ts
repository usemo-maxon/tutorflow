import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase";

function safeNext(value: string | null) {
  if (value?.startsWith("/app/") || value?.startsWith("/odzyskaj-haslo"))
    return value;
  return "/app/dzisiaj";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) redirect("/logowanie?error=oauth");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) redirect("/logowanie?error=oauth");
  redirect(safeNext(url.searchParams.get("next")));
}
