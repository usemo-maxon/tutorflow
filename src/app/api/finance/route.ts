import { FinanceActionSchema } from "@/lib/finance";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { getFinancialOverview, mutateFinance } from "@/server/finance";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const startedAt = performance.now();
    const teacherId = await currentTeacherId();
    if (!teacherId) throw unauthenticated();
    const authorizedAt = performance.now();
    const search = new URL(request.url).searchParams;
    const cursor = Number(search.get("cursor") ?? 0);
    const data = await getFinancialOverview(teacherId, {
      studentId: search.get("studentId") ?? undefined,
      cursor: Number.isInteger(cursor) && cursor >= 0 ? cursor : 0,
    });
    return Response.json(data, {
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `auth;dur=${(authorizedAt - startedAt).toFixed(1)}, finance;dur=${(performance.now() - authorizedAt).toFixed(1)}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const teacherId = await currentTeacherId();
    if (!teacherId) throw unauthenticated();
    const parsed = FinanceActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiFailure(422, {
        code: "VALIDATION_ERROR",
        message: "Sprawdź kwotę, datę i wybrane pozycje.",
        fieldErrors: Object.fromEntries(
          Object.entries(parsed.error.flatten().fieldErrors).map(
            ([field, messages]) => [field, messages?.join(" ") ?? ""],
          ),
        ),
      });
    }
    return Response.json(await mutateFinance(teacherId, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}

function assertSameOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiFailure(403, {
      code: "CROSS_SITE_REQUEST",
      message: "Żądanie zostało odrzucone.",
    });
  }
}

function unauthenticated() {
  return new ApiFailure(401, {
    code: "UNAUTHENTICATED",
    message: "Sesja wygasła. Zaloguj się ponownie.",
  });
}
