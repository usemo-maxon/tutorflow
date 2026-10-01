import { getGuestRescheduleAvailability } from "@/server/booking-management";
import { errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const search = new URL(request.url).searchParams;
    return Response.json(
      await getGuestRescheduleAvailability(
        token,
        search.get("startDate") ?? "",
        search.get("endDate") ?? "",
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
