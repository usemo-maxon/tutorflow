import { cookies } from "next/headers";
import { z } from "zod";
import { SESSION_COOKIE } from "@/server/auth";
import { isSupabaseConfigured, siteUrl } from "@/server/env";
import { ApiFailure, errorResponse } from "@/server/errors";
import { createSupabaseServerClient } from "@/server/supabase";
import {
  createSession,
  createTeacher,
  deleteSession,
  ensureDemoTeacher,
  findTeacherByEmail,
  getTeacherBySession,
  verifyPassword,
} from "@/server/store";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.email("Podaj poprawny adres e-mail."),
  password: z.string().min(1, "Podaj hasło."),
});
const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2, "Podaj imię i nazwisko."),
  password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków."),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  if (action !== "session")
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return Response.json({ teacher: data.user ? { id: data.user.id } : null });
  }
  const cookieStore = await cookies();
  return Response.json({
    teacher: await getTeacherBySession(cookieStore.get(SESSION_COOKIE)?.value),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    if (!isSupabaseConfigured()) return localAuth(request, action);
    const supabase = await createSupabaseServerClient();
    if (action === "logout") {
      await supabase.auth.signOut();
      return Response.json({ ok: true });
    }
    if (action === "demo") {
      if (process.env.NODE_ENV === "production")
        throw new ApiFailure(404, {
          code: "NOT_FOUND",
          message: "Nie znaleziono strony.",
        });
      throw new ApiFailure(503, {
        code: "DEMO_DISABLED",
        message:
          "Konto demonstracyjne jest dostępne tylko z lokalnym backendem.",
      });
    }
    if (action === "request-reset") {
      const parsed = z
        .object({ email: z.email() })
        .safeParse(await request.json());
      if (!parsed.success)
        throw formFailure({ email: ["Podaj poprawny adres e-mail."] });
      const { error } = await supabase.auth.resetPasswordForEmail(
        parsed.data.email,
        {
          redirectTo: `${siteUrl()}/api/auth/callback?next=${encodeURIComponent("/odzyskaj-haslo?mode=update")}`,
        },
      );
      if (error) throw providerFailure();
      return Response.json({ ok: true });
    }
    if (action === "update-password") {
      const parsed = z
        .object({ password: z.string().min(8) })
        .safeParse(await request.json());
      if (!parsed.success)
        throw formFailure({
          password: ["Hasło musi mieć co najmniej 8 znaków."],
        });
      const { error } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (error) throw providerFailure();
      return Response.json({ ok: true });
    }
    if (action === "register") {
      const parsed = registerSchema.safeParse(await request.json());
      if (!parsed.success)
        throw formFailure(parsed.error.flatten().fieldErrors);
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: { full_name: parsed.data.name },
          emailRedirectTo: `${siteUrl()}/api/auth/callback?next=${encodeURIComponent("/app/dzisiaj")}`,
        },
      });
      if (error) {
        const duplicate = /already|registered|exists/i.test(error.message);
        throw new ApiFailure(422, {
          code: duplicate ? "EMAIL_TAKEN" : "AUTH_ERROR",
          message: duplicate
            ? "Konto z tym adresem już istnieje."
            : "Nie udało się utworzyć konta.",
          fieldErrors: duplicate
            ? { email: "Ten adres e-mail jest już używany." }
            : undefined,
        });
      }
      return Response.json({
        teacher: data.session && data.user ? { id: data.user.id } : undefined,
        requiresEmailConfirmation: !data.session,
      });
    }
    if (action === "login") {
      const parsed = loginSchema.safeParse(await request.json());
      if (!parsed.success)
        throw formFailure(parsed.error.flatten().fieldErrors);
      const { data, error } = await supabase.auth.signInWithPassword(
        parsed.data,
      );
      if (error || !data.user)
        throw new ApiFailure(401, {
          code: "INVALID_CREDENTIALS",
          message: "Adres e-mail lub hasło są nieprawidłowe.",
        });
      return Response.json({ teacher: { id: data.user.id } });
    }
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

async function localAuth(request: Request, action: string) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Supabase is required in production");
  const cookieStore = await cookies();
  if (action === "logout") {
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (token) await deleteSession(token);
    cookieStore.delete(SESSION_COOKIE);
    return Response.json({ ok: true });
  }
  let teacher;
  if (action === "demo") teacher = await ensureDemoTeacher();
  else if (action === "register") {
    const parsed = registerSchema.safeParse(await request.json());
    if (!parsed.success) throw formFailure(parsed.error.flatten().fieldErrors);
    teacher = await createTeacher(parsed.data);
  } else if (action === "login") {
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) throw formFailure(parsed.error.flatten().fieldErrors);
    const record = await findTeacherByEmail(parsed.data.email);
    if (!record || !verifyPassword(parsed.data.password, record.passwordHash))
      throw new ApiFailure(401, {
        code: "INVALID_CREDENTIALS",
        message: "Adres e-mail lub hasło są nieprawidłowe.",
      });
    teacher = record;
  } else return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const token = await createSession(teacher.id);
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 2_592_000,
  });
  return Response.json({ teacher: { id: teacher.id } });
}

function formFailure(fields: Record<string, string[] | undefined>): ApiFailure {
  return new ApiFailure(422, {
    code: "VALIDATION_ERROR",
    message: "Popraw oznaczone pola.",
    fieldErrors: Object.fromEntries(
      Object.entries(fields)
        .filter((entry): entry is [string, string[]] => Boolean(entry[1]?.[0]))
        .map(([key, messages]) => [key, messages[0]]),
    ),
  });
}
function providerFailure() {
  return new ApiFailure(502, {
    code: "AUTH_PROVIDER_ERROR",
    message: "Nie udało się wykonać operacji. Spróbuj ponownie.",
    retryable: true,
  });
}
