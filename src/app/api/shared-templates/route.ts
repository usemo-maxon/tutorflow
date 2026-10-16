import { sharedTemplateFiltersFromSearchParams } from "@/lib/shared-templates";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { getSharedTemplates } from "@/server/shared-templates";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    return Response.json(
      await getSharedTemplates(
        await teacher(),
        sharedTemplateFiltersFromSearchParams(
          new URL(request.url).searchParams,
        ),
      ),
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
