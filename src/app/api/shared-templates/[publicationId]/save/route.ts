import { z } from "zod";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { saveSharedTemplate } from "@/server/shared-templates";

export const runtime = "nodejs";

const SaveSharedTemplateSchema = z.object({
  copyId: z.uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicationId: string }> },
) {
  try {
    sameOrigin(request);
    const teacherId = await currentTeacherId();
    if (!teacherId)
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Sesja wygasła. Zaloguj się ponownie.",
      });
    const parsed = z.uuid().safeParse((await params).publicationId);
    if (!parsed.success)
      throw new ApiFailure(422, {
        code: "VALIDATION_ERROR",
        message: "Nieprawidłowy identyfikator szablonu.",
      });
    const input = SaveSharedTemplateSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success)
      throw new ApiFailure(422, {
        code: "VALIDATION_ERROR",
        message: "Nie udało się przygotować bezpiecznej kopii szablonu.",
      });
    return Response.json(
      await saveSharedTemplate(teacherId, parsed.data, input.data.copyId),
      {
        status: 201,
      },
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
