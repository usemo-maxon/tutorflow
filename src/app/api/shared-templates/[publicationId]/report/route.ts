import { z } from "zod";
import { ReportTemplateInputSchema } from "@/lib/community-quality";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { reportSharedTemplate } from "@/server/shared-templates";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicationId: string }> },
) {
  try {
    sameOrigin(request);
    const teacherId = await currentTeacherId();
    if (!teacherId) unauthenticated();
    const publicationId = z.uuid().safeParse((await params).publicationId);
    const input = ReportTemplateInputSchema.safeParse(await request.json());
    if (!publicationId.success || !input.success)
      invalid(input.success ? undefined : input.error.issues[0]?.message);
    return Response.json(
      await reportSharedTemplate(teacherId, publicationId.data, input.data),
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
function invalid(message = "Sprawdź dane zgłoszenia."): never {
  throw new ApiFailure(422, { code: "VALIDATION_ERROR", message });
}
