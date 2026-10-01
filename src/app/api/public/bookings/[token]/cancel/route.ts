import { cancelGuestBooking } from "@/server/booking-management";
import { ApiFailure, errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new ApiFailure(403, {
        code: "CROSS_SITE_REQUEST",
        message: "Żądanie zostało odrzucone.",
      });
    const { token } = await params;
    return Response.json(await cancelGuestBooking(token), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
