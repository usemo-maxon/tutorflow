import { NextResponse } from "next/server";
import { assertSameOrigin, formString } from "@/server/admin-request";
import { currentTeacher } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase";

export async function POST(request: Request) {
  assertSameOrigin(request);
  const teacher = await currentTeacher();
  if (!teacher) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Zaloguj się ponownie." }, { status: 401 });
  const form = await request.formData(); const subject = formString(form, "subject", 160); const description = formString(form, "description", 5000); const category = formString(form, "category", 30); const priority = formString(form, "priority", 20);
  if (subject.length < 3 || description.length < 10 || !["account", "billing", "calendar", "lessons", "other"].includes(category) || !["low", "normal", "high", "urgent"].includes(priority)) return NextResponse.json({ code: "INVALID_INPUT", message: "Uzupełnij poprawnie wszystkie pola." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_support_ticket", { ticket_subject: subject, ticket_description: description, ticket_category: category, ticket_priority: priority });
  if (error) return NextResponse.json({ code: "TICKET_FAILED", message: "Nie udało się utworzyć zgłoszenia." }, { status: error.code === "P0001" ? 429 : 400 });
  return NextResponse.redirect(new URL("/app/pomoc?sent=1", request.url), 303);
}

