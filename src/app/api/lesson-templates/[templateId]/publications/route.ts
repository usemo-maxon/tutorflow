import { z } from "zod";
import { CommunityTemplateSubmissionInputSchema } from "@/lib/community-templates";
import { currentTeacherId } from "@/server/auth";
import { submitCommunityTemplate } from "@/server/community-templates";
import { ApiFailure, errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    sameOrigin(request);
    const teacherId = await currentTeacherId();
    if (!teacherId) unauthenticated();
    const templateId = z.uuid().safeParse((await params).templateId);
    if (!templateId.success) invalid("Nieprawidłowy identyfikator szablonu.");
    const input = CommunityTemplateSubmissionInputSchema.safeParse(
      await request.json(),
    );
    if (!input.success) invalid(input.error.issues[0]?.message);
    return Response.json(
      await submitCommunityTemplate(teacherId, templateId.data, input.data),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiFailure(403, {
      code: "CROSS_SITE_REQUEST",
      message: "Żądanie zostało odrzucone.",
    });
}
function unauthenticated(): never {
  throw new ApiFailure(401, {
    code: "UNAUTHENTICATED",
    message: "Sesja wygasła. Zaloguj się ponownie.",
  });
}
function invalid(message = "Sprawdź dane publikacji."): never {
  throw new ApiFailure(422, { code: "VALIDATION_ERROR", message });
}
