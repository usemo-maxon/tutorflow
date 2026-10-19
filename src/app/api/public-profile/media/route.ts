import { randomUUID } from "node:crypto";
import { currentTeacher } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { createSupabaseServerClient } from "@/server/supabase";

const RULES = {
  video: { max: 100 * 1024 * 1024, types: ["video/mp4", "video/webm"] },
  certificate: { max: 10 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
  poster: { max: 5 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp"] },
} as const;

export async function POST(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new ApiFailure(403, { code: "CROSS_SITE_REQUEST", message: "Żądanie zostało odrzucone." });
    const teacher = await currentTeacher();
    if (!teacher) throw new ApiFailure(401, { code: "UNAUTHENTICATED", message: "Zaloguj się ponownie." });
    const body = await request.json() as { kind?: keyof typeof RULES; name?: string; type?: string; size?: number };
    const rule = body.kind ? RULES[body.kind] : undefined;
    if (!rule || !body.type || !rule.types.some((type) => type === body.type) || !body.size || body.size > rule.max) throw new ApiFailure(422, { code: "INVALID_MEDIA", message: "Format lub rozmiar pliku nie jest obsługiwany." });
    const extensionByType: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
    const path = `${teacher.id}/${body.kind}/${randomUUID()}.${extensionByType[body.type]}`;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.storage.from("tutor-profile-media").createSignedUploadUrl(path);
    if (error) throw new ApiFailure(500, { code: "UPLOAD_URL_FAILED", message: "Nie udało się przygotować przesyłania pliku." });
    return Response.json({ path, token: data.token });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new ApiFailure(403, { code: "CROSS_SITE_REQUEST", message: "Żądanie zostało odrzucone." });
    const teacher = await currentTeacher();
    if (!teacher) throw new ApiFailure(401, { code: "UNAUTHENTICATED", message: "Zaloguj się ponownie." });
    const path = new URL(request.url).searchParams.get("path");
    if (!path?.startsWith(`${teacher.id}/`) || path.includes("..")) throw new ApiFailure(422, { code: "INVALID_PATH", message: "Nieprawidłowa ścieżka pliku." });
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.storage.from("tutor-profile-media").remove([path]);
    if (error) throw new ApiFailure(500, { code: "DELETE_FAILED", message: "Nie udało się usunąć pliku." });
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
