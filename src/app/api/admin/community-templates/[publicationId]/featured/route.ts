import { z } from "zod";
import { FeatureTemplateInputSchema } from "@/lib/community-quality";
import { currentTeacherId } from "@/server/auth";
import { setCommunityTemplateFeatured } from "@/server/community-templates";
import { ApiFailure, errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ publicationId: string }> },
) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new ApiFailure(403, {
        code: "CROSS_SITE_REQUEST",
        message: "Żądanie zostało odrzucone.",
      });
    const teacherId = await currentTeacherId();
    if (!teacherId)
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Sesja wygasła. Zaloguj się ponownie.",
      });
    const publicationId = z.uuid().safeParse((await params).publicationId);
    const input = FeatureTemplateInputSchema.safeParse(await request.json());
    if (!publicationId.success || !input.success)
      throw new ApiFailure(422, {
        code: "VALIDATION_ERROR",
        message: input.success
          ? "Nieprawidłowy szablon."
          : (input.error.issues[0]?.message ?? "Sprawdź dane."),
      });
    return Response.json(
      await setCommunityTemplateFeatured(
        teacherId,
        publicationId.data,
        input.data.featured,
        input.data.order,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
