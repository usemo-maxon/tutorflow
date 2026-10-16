import { z } from "zod";
import { FavoriteTemplateInputSchema } from "@/lib/community-quality";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { setSharedTemplateFavorite } from "@/server/shared-templates";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ publicationId: string }> },
) {
  try {
    sameOrigin(request);
    const teacherId = await currentTeacherId();
    if (!teacherId) unauthenticated();
    const publicationId = z.uuid().safeParse((await params).publicationId);
    const input = FavoriteTemplateInputSchema.safeParse(await request.json());
    if (!publicationId.success || !input.success) invalid();
    return Response.json(
      await setSharedTemplateFavorite(
        teacherId,
        publicationId.data,
        input.data.favorite,
      ),
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
function invalid(): never {
  throw new ApiFailure(422, {
    code: "VALIDATION_ERROR",
    message: "Nieprawidłowe dane ulubionego szablonu.",
  });
}
