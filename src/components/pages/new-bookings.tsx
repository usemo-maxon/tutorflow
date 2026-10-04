"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarCheck2, Clock3, RefreshCw } from "lucide-react";
import Link from "next/link";
import { ClientApiError, fetchTutorBookings } from "@/lib/api-client";
import { bookingDetailHref } from "@/lib/booking-schedule";
import { formatDateTime, formatShortDay, formatTime } from "@/lib/format";
import { selectNewBookings } from "@/lib/new-bookings";
import styles from "./new-bookings.module.css";

export function NewBookings({
  teacherId,
  timezone,
  now,
}: {
  teacherId: string;
  timezone: string;
  now: Date;
}) {
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["new-bookings", teacherId],
    queryFn: ({ signal }) => fetchTutorBookings(signal),
    refetchInterval: 30_000,
    refetchOnMount: "always",
    retry: (count, error) =>
      !(error instanceof ClientApiError && error.status < 500) && count < 2,
  });
  const bookings = selectNewBookings(data ?? [], teacherId, now);

  if (isPending)
    return (
      <div className={styles.loading} role="status">
        Sprawdzanie nowych rezerwacji…
      </div>
    );
  if (!isError && bookings.length === 0) return null;

  return (
    <section className={styles.panel} aria-labelledby="new-bookings-heading">
      <header className={styles.header}>
        <span className={styles.icon}>
          <CalendarCheck2 size={24} aria-hidden="true" />
        </span>
        <div className={styles.heading}>
          <div className={styles.title}>
            <h2 id="new-bookings-heading">Nowe rezerwacje</h2>
            {bookings.length > 0 && (
              <span
                className={styles.count}
                aria-label={`${bookings.length} rezerwacji`}
              >
                {bookings.length}
              </span>
            )}
          </div>
          <p>Zapisy z Twojej strony · jeszcze niedodane do lekcji</p>
        </div>
        <Link className={styles.all} href="/app/rezerwacje">
          Wszystkie rezerwacje <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>
      {isError && (
        <div className={styles.error} role="status">
          <span>
            Nie udało się odświeżyć rezerwacji.
            {data
              ? " Wyświetlamy ostatnio pobrane dane."
              : " Spróbuj ponownie."}
          </span>
          <button
            className="text-link"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RefreshCw size={15} aria-hidden="true" /> Odśwież
          </button>
        </div>
      )}
      {bookings.length > 0 && (
        <ul className={styles.list}>
          {bookings.slice(0, 3).map((booking) => (
            <li key={booking.bookingId}>
              <Link
                className={styles.card}
                href={bookingDetailHref(booking.bookingId)}
              >
                <div className={styles.received}>
                  Zapis: {formatDateTime(booking.createdAt, timezone)}
                </div>
                <h3>{booking.guestName}</h3>
                <p className={styles.event}>{booking.eventTypeName}</p>
                <div className={styles.appointment}>
                  <Clock3 size={17} aria-hidden="true" />
                  <time dateTime={booking.startsAt}>
                    <strong>
                      {formatShortDay(booking.startsAt, timezone)}
                    </strong>
                    <span>
                      {formatTime(booking.startsAt, timezone)}–
                      {formatTime(booking.endsAt, timezone)} ·{" "}
                      {booking.format === "online" ? "Online" : "Stacjonarnie"}
                    </span>
                  </time>
                </div>
                {booking.guestGoal && (
                  <p className={styles.goal}>{booking.guestGoal}</p>
                )}
                <span className={styles.open}>
                  Zobacz szczegóły <ArrowRight size={17} aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {bookings.length > 3 && (
        <Link className={styles.more} href="/app/rezerwacje">
          Zobacz pozostałe rezerwacje ({bookings.length - 3}){" "}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
