import { LessonTemplateInputSchema } from "@/lib/lesson-templates";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import {
  archiveLessonTemplate,
  duplicateLessonTemplate,
  updateLessonTemplate,
} from "@/server/lesson-templates";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    sameOrigin(request);
    const teacherId = await teacher();
    const { templateId } = await params;
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "action" in body) {
      const action = (body as { action?: unknown }).action;
      if (action === "archive")
        return Response.json(
          await archiveLessonTemplate(teacherId, templateId),
        );
      if (action === "duplicate")
        return Response.json(
          await duplicateLessonTemplate(teacherId, templateId),
          { status: 201 },
        );
    }
    const parsed = LessonTemplateInputSchema.safeParse(body);
    if (!parsed.success) invalid(parsed.error.issues[0]?.message);
    return Response.json(
      await updateLessonTemplate(teacherId, templateId, parsed.data),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function teacher() {
  const id = await currentTeacherId();
  if (!id)
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Sesja wygasła. Zaloguj się ponownie.",
    });
  return id;
}
function invalid(message = "Sprawdź dane szablonu."): never {
  throw new ApiFailure(422, { code: "VALIDATION_ERROR", message });
}
function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiFailure(403, {
      code: "CROSS_SITE_REQUEST",
      message: "Żądanie zostało odrzucone.",
    });
}
