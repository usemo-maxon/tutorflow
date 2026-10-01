import { buildBookingIcs } from "@/lib/booking-ics";
import {
  getGuestBooking,
  hashBookingManagementToken,
} from "@/server/booking-management";
import { siteUrl } from "@/server/env";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const booking = await getGuestBooking(token);
    const managementUrl = `${siteUrl()}/rezerwacja/${token}`;
    const content = buildBookingIcs({
      booking,
      reference: hashBookingManagementToken(token).slice(0, 24),
      managementUrl,
    });
    return new Response(content, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="rezerwacja-easy4tutor.ics"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Ta rezerwacja jest niedostępna.", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
