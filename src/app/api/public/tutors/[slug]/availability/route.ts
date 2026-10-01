import { ApiFailure, errorResponse } from "@/server/errors";
import { getPublicTutorAvailability } from "@/server/booking-availability";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const url = new URL(request.url);
    const eventTypeId = url.searchParams.get("eventTypeId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    if (!eventTypeId || !startDate || !endDate) {
      throw new ApiFailure(400, {
        code: "MISSING_AVAILABILITY_PARAMETERS",
        message: "Wybierz rodzaj zajęć i zakres dat.",
      });
    }
    return Response.json(
      await getPublicTutorAvailability(
        (await params).slug,
        eventTypeId,
        startDate,
        endDate,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
