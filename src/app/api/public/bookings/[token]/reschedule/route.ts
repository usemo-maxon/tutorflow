import { BookingRescheduleInputSchema } from "@/lib/validation";
import { rescheduleGuestBooking } from "@/server/booking-management";
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
    const parsed = BookingRescheduleInputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiFailure(400, {
        code: "VALIDATION_ERROR",
        message: "Wybierz poprawny termin.",
      });
    const { token } = await params;
    return Response.json(
      await rescheduleGuestBooking(token, parsed.data.startsAt),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
