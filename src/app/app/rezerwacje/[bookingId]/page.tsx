import { BookingsPage } from "@/components/pages/bookings-page";

export default async function Page({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return <BookingsPage initialBookingId={bookingId} />;
}
