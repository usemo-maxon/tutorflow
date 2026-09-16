import { AppActionSchema, fieldErrors } from "@/lib/validation";
import { currentTeacher } from "@/server/auth";
import { performAction } from "@/server/app-service";
import { ApiFailure, errorResponse } from "@/server/errors";
import { getAppData } from "@/server/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const teacher = await currentTeacher();
    if (!teacher) throw unauthenticated();
    const url = new URL(request.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const range = start && end ? { start, end } : undefined;
    if (
      range &&
      (!Number.isFinite(Date.parse(range.start)) ||
        !Number.isFinite(Date.parse(range.end)) ||
        range.end <= range.start)
    ) {
      throw new ApiFailure(422, {
        code: "INVALID_CALENDAR_RANGE",
        message: "Nieprawidłowy zakres kalendarza.",
      });
    }
    return Response.json(await getAppData(teacher.id, range));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const teacher = await currentTeacher();
    if (!teacher) throw unauthenticated();
    const parsed = AppActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiFailure(422, {
        code: "VALIDATION_ERROR",
        message: "Popraw oznaczone pola.",
        fieldErrors: fieldErrors(parsed.error),
      });
    }
    return Response.json(await performAction(teacher.id, parsed.data));
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
