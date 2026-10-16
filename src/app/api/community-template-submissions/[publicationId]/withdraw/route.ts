import { z } from "zod";
import { currentTeacherId } from "@/server/auth";
import { withdrawCommunityTemplate } from "@/server/community-templates";
import { ApiFailure, errorResponse } from "@/server/errors";

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
    if (!publicationId.success) invalid();
    return Response.json(
      await withdrawCommunityTemplate(teacherId, publicationId.data),
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
    message: "Nieprawidłowy identyfikator publikacji.",
  });
}
