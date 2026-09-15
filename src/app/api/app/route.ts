import type { AppAction } from "@/lib/domain";
import { currentTeacher } from "@/server/auth";
import { performAction } from "@/server/app-service";
import { ApiFailure, errorResponse } from "@/server/errors";
import { getAppData } from "@/server/repository";

export const runtime = "nodejs";

const actionTypes = new Set<AppAction["type"]>([
  "createStudent",
  "updateStudent",
  "setStudentStatus",
  "createLesson",
  "mergeLesson",
  "saveLesson",
  "setPayment",
  "cancelLesson",
  "rescheduleLesson",
  "retrySync",
  "disableSync",
  "updateProfile",
  "createAvailability",
  "deleteAvailability",
  "importStudentStats",
]);

export async function GET() {
  try {
    const teacher = await currentTeacher();
    if (!teacher) throw unauthenticated();
    return Response.json(await getAppData(teacher.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const teacher = await currentTeacher();
    if (!teacher) throw unauthenticated();
    const body = (await request.json()) as { type?: string };
    if (!body.type || !actionTypes.has(body.type as AppAction["type"])) {
      throw new ApiFailure(400, {
        code: "INVALID_ACTION",
        message: "Nie udało się rozpoznać działania.",
      });
    }
    return Response.json(await performAction(teacher.id, body as AppAction));
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

function assertSameOrigin(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new ApiFailure(403, {
      code: "CROSS_SITE_REQUEST",
      message: "Żądanie zostało odrzucone.",
    });
  }
}
