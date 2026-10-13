import {
  LessonTemplateInputSchema,
  templateFiltersFromSearchParams,
} from "@/lib/lesson-templates";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import {
  createLessonTemplate,
  getLessonTemplates,
} from "@/server/lesson-templates";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    return Response.json(
      await getLessonTemplates(
        await teacher(),
        templateFiltersFromSearchParams(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const parsed = LessonTemplateInputSchema.safeParse(await request.json());
    if (!parsed.success) invalid(parsed.error.issues[0]?.message);
    return Response.json(
      await createLessonTemplate(await teacher(), parsed.data),
      { status: 201 },
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
