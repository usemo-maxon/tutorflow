import type { Metadata } from "next";
import { GuestBookingPage } from "@/components/guest-booking-page";
import { getGuestBooking } from "@/server/booking-management";

export const metadata: Metadata = {
  title: "Twoja rezerwacja | easy4tutor",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let booking;
  try {
    booking = await getGuestBooking(token);
  } catch {
    return <GuestBookingPage />;
  }
  return <GuestBookingPage token={token} initialBooking={booking} />;
}
