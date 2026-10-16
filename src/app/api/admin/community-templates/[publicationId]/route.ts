import { z } from "zod";
import { currentTeacherId } from "@/server/auth";
import { moderateCommunityTemplate } from "@/server/community-templates";
import { ApiFailure, errorResponse } from "@/server/errors";

const ModerationInputSchema = z.object({
  action: z.enum(["approve", "reject", "withdraw"]),
  feedback: z.string().trim().max(2_000).optional(),
});

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ publicationId: string }> },
) {
  try {
    sameOrigin(request);
    const teacherId = await currentTeacherId();
    if (!teacherId) unauthenticated();
    const publicationId = z.uuid().safeParse((await params).publicationId);
    if (!publicationId.success)
      invalid("Nieprawidłowy identyfikator publikacji.");
    const input = ModerationInputSchema.safeParse(await request.json());
    if (!input.success) invalid(input.error.issues[0]?.message);
    return Response.json(
      await moderateCommunityTemplate(
        teacherId,
        publicationId.data,
        input.data.action,
        input.data.feedback,
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
function invalid(message = "Sprawdź dane moderacji."): never {
  throw new ApiFailure(422, { code: "VALIDATION_ERROR", message });
}
