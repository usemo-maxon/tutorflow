import { LessonWorkspaceActionSchema } from "@/lib/lesson-workspace";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import {
  getLessonWorkspace,
  mutateLessonWorkspace,
} from "@/server/lesson-workspace";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const teacherId = await currentTeacherId();
    if (!teacherId) throw unauthenticated();
    const { lessonId } = await params;
    return Response.json(await getLessonWorkspace(teacherId, lessonId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    assertSameOrigin(request);
    const teacherId = await currentTeacherId();
    if (!teacherId) throw unauthenticated();
    const parsed = LessonWorkspaceActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiFailure(422, {
        code: "VALIDATION_ERROR",
        message: "Sprawdź wprowadzone dane i spróbuj ponownie.",
      });
    }
    const { lessonId } = await params;
    return Response.json(
      await mutateLessonWorkspace(teacherId, lessonId, parsed.data),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function unauthenticated() {
  return new ApiFailure(401, {
    code: "UNAUTHENTICATED",
    message: "Sesja wygasła. Zaloguj się ponownie.",
  });
}

function assertSameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiFailure(403, {
      code: "CROSS_SITE_REQUEST",
      message: "Żądanie zostało odrzucone.",
    });
  }
}
