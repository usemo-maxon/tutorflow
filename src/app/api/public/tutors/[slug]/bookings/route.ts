import { createPublicBooking } from "@/server/public-booking";
import { ApiFailure, errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiFailure(403, {
        code: "CROSS_SITE_REQUEST",
        message: "Żądanie zostało odrzucone.",
      });
    }
    const rawBody = await request.text();
    if (rawBody.length > 12_000) {
      throw new ApiFailure(413, {
        code: "REQUEST_TOO_LARGE",
        message: "Formularz jest zbyt duży.",
      });
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new ApiFailure(400, {
        code: "VALIDATION_ERROR",
        message: "Sprawdź podane dane.",
      });
    }
    return Response.json(
      await createPublicBooking({ ...body, slug: (await params).slug }),
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
