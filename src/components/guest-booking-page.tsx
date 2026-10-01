"use client";

import {
  CalendarPlus,
  CalendarClock,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  MapPin,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { GuestBooking } from "@/lib/public-booking";

type Availability = {
  timezone: string;
  days: Array<{
    date: string;
    slots: Array<{ startsAt: string; endsAt: string }>;
  }>;
};

export function GuestBookingPage({
  initialBooking,
  token,
}: {
  initialBooking?: GuestBooking;
  token?: string;
}) {
  const [booking, setBooking] = useState(initialBooking);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [rangeOffset, setRangeOffset] = useState(0);
  const [availability, setAvailability] = useState<Availability>();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] =
    useState<Availability["days"][number]["slots"][number]>();
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);

  useEffect(() => {
    if (!rescheduling || !booking || !token) return;
    const localToday = formatInTimeZone(
      new Date(),
      booking.timezone,
      "yyyy-MM-dd",
    );
    const first = addDays(parseISO(localToday), rangeOffset);
    const startDate = format(first, "yyyy-MM-dd");
    const endDate = format(addDays(first, 6), "yyyy-MM-dd");
    const controller = new AbortController();
    setLoadingSlots(true);
    setError("");
    void fetch(
      `/api/public/bookings/${encodeURIComponent(token)}/availability?startDate=${startDate}&endDate=${endDate}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const body = (await response.json()) as Availability & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(body.message || "Nie udało się pobrać terminów.");
        setAvailability(body);
        setSelectedDate(
          body.days.find((day) => day.slots.length)?.date ??
            body.days[0]?.date ??
            "",
        );
        setSelectedSlot(undefined);
      })
      .catch((reason) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Nie udało się pobrać terminów.",
        );
      })
      .finally(() => setLoadingSlots(false));
    return () => controller.abort();
  }, [availabilityRefresh, booking, rangeOffset, rescheduling, token]);

  if (!booking || !token) {
    return (
      <GuestShell>
        <div className="guest-booking-state guest-booking-state--muted">
          <CalendarX2 size={32} aria-hidden="true" />
          <h1>Ta rezerwacja jest niedostępna</h1>
          <p>Link jest nieprawidłowy, wygasł lub został wycofany.</p>
        </div>
      </GuestShell>
    );
  }

  const date = new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: booking.timezone,
  }).format(new Date(booking.startsAt));
  const time = (value: string) =>
    new Intl.DateTimeFormat("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: booking.timezone,
    }).format(new Date(value));

  async function cancel() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/public/bookings/${encodeURIComponent(token!)}/cancel`,
        { method: "POST" },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(body.message || "Nie udało się anulować rezerwacji.");
      setBooking((current) =>
        current
          ? {
              ...current,
              status: "cancelled",
              canCancel: false,
              cancellationBlockedReason: "cancelled",
              canReschedule: false,
              rescheduleBlockedReason: "cancelled",
            }
          : current,
      );
      setConfirming(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Nie udało się anulować rezerwacji.",
      );
    } finally {
      setPending(false);
    }
  }

  async function reschedule() {
    if (!selectedSlot) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/public/bookings/${encodeURIComponent(token!)}/reschedule`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ startsAt: selectedSlot.startsAt }),
        },
      );
      const body = (await response.json()) as GuestBooking & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(body.message || "Nie udało się zmienić terminu.");
      setBooking(body);
      setRescheduling(false);
      setAvailability(undefined);
      setSelectedSlot(undefined);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Nie udało się zmienić terminu.",
      );
      setSelectedSlot(undefined);
      setAvailabilityRefresh((current) => current + 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <GuestShell>
      <div className="guest-booking-heading">
        <span className="guest-booking-kicker">
          <ShieldCheck size={15} aria-hidden="true" /> Bezpieczny link
          rezerwacji
        </span>
        <h1>Twoja rezerwacja</h1>
      </div>

      <div className="guest-booking-card">
        <div className="guest-booking-card__title">
          <div>
            <strong>{booking.tutorPublicName}</strong>
            <span>{booking.eventTypeName}</span>
          </div>
          <Status booking={booking} />
        </div>
        <div className="guest-booking-when">
          <CalendarPlus size={21} aria-hidden="true" />
          <div>
            <strong>{date}</strong>
            <span>
              {time(booking.startsAt)}–{time(booking.endsAt)}
            </span>
          </div>
        </div>
        <div className="guest-booking-meta">
          <span>
            {booking.format === "online" ? (
              <Monitor size={18} aria-hidden="true" />
            ) : (
              <MapPin size={18} aria-hidden="true" />
            )}
            {booking.format === "online"
              ? "Online"
              : booking.publicLocation || "Stacjonarnie"}
          </span>
          <span>
            <Clock3 size={18} aria-hidden="true" /> {booking.timezone}
          </span>
        </div>
      </div>

      {booking.status === "converted" ? (
        <div className="guest-booking-notice">
          <strong>Ta rezerwacja została już przekształcona w lekcję.</strong>
          <span>Skontaktuj się z nauczycielem, aby zmienić termin.</span>
        </div>
      ) : booking.status === "cancelled" ? (
        <div className="guest-booking-state guest-booking-state--cancelled">
          <CheckCircle2 size={28} aria-hidden="true" />
          <div>
            <strong>Rezerwacja została anulowana</strong>
            <span>Termin jest ponownie dostępny dla innych osób.</span>
          </div>
        </div>
      ) : booking.cancellationBlockedReason === "deadline" ? (
        <div className="guest-booking-notice">
          <strong>Nie możesz już anulować tej rezerwacji online.</strong>
          <span>Skontaktuj się z nauczycielem.</span>
        </div>
      ) : null}

      {booking.status === "confirmed" &&
        booking.rescheduleBlockedReason === "deadline" && (
          <div className="guest-booking-notice">
            <strong>Nie możesz już zmienić terminu online.</strong>
            <span>Skontaktuj się z nauczycielem.</span>
          </div>
        )}

      {rescheduling && booking.canReschedule && (
        <section
          className="guest-reschedule"
          aria-labelledby="reschedule-title"
        >
          <div className="guest-reschedule__heading">
            <div>
              <p className="eyebrow">Nowy termin</p>
              <h2 id="reschedule-title">Wybierz dostępną datę i godzinę</h2>
            </div>
            <div className="guest-reschedule__nav">
              <button
                type="button"
                className="icon-button icon-button--border"
                aria-label="Poprzedni tydzień"
                disabled={rangeOffset === 0 || loadingSlots}
                onClick={() =>
                  setRangeOffset((current) => Math.max(0, current - 7))
                }
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="icon-button icon-button--border"
                aria-label="Następny tydzień"
                disabled={loadingSlots}
                onClick={() => setRangeOffset((current) => current + 7)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          {loadingSlots ? (
            <p className="public-availability__notice" aria-live="polite">
              Pobieramy dostępne terminy…
            </p>
          ) : availability ? (
            <>
              <div className="public-availability__dates" role="list">
                {availability.days.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    className={`public-availability__date${selectedDate === day.date ? " public-availability__date--selected" : ""}`}
                    onClick={() => {
                      setSelectedDate(day.date);
                      setSelectedSlot(undefined);
                    }}
                    disabled={!day.slots.length}
                  >
                    <span>{format(parseISO(day.date), "dd.MM")}</span>
                    <small>
                      {day.slots.length
                        ? `${day.slots.length} terminów`
                        : "Brak"}
                    </small>
                  </button>
                ))}
              </div>
              {(availability.days.find((day) => day.date === selectedDate)
                ?.slots.length ?? 0) > 0 ? (
                <div className="public-availability__slots">
                  {availability.days
                    .find((day) => day.date === selectedDate)
                    ?.slots.map((slot) => (
                      <button
                        key={slot.startsAt}
                        type="button"
                        className={`public-availability__slot${selectedSlot?.startsAt === slot.startsAt ? " public-availability__slot--selected" : ""}`}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {time(slot.startsAt)}
                      </button>
                    ))}
                </div>
              ) : (
                <p className="public-availability__empty">
                  Brak wolnych terminów tego dnia.
                </p>
              )}
            </>
          ) : null}
          {error && <p className="guest-booking-error">{error}</p>}
          <div className="guest-reschedule__actions">
            <button
              className="button button--primary"
              type="button"
              disabled={!selectedSlot || pending}
              onClick={() => void reschedule()}
            >
              {pending ? "Zmienianie terminu…" : "Potwierdź nowy termin"}
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={pending}
              onClick={() => {
                setRescheduling(false);
                setError("");
              }}
            >
              Wróć
            </button>
          </div>
        </section>
      )}

      {booking.status !== "cancelled" && !rescheduling && (
        <div className="guest-booking-actions">
          <a
            className="button button--primary button--large"
            href={`/rezerwacja/${encodeURIComponent(token)}/kalendarz.ics`}
          >
            <CalendarPlus size={18} aria-hidden="true" /> Dodaj do kalendarza
          </a>
          {booking.canReschedule && (
            <button
              className="button button--secondary button--large"
              type="button"
              onClick={() => {
                setRangeOffset(0);
                setRescheduling(true);
                setConfirming(false);
                setError("");
              }}
            >
              <CalendarClock size={18} aria-hidden="true" /> Zmień termin
            </button>
          )}
          {booking.canCancel && !confirming && (
            <button
              className="button button--quiet button--large guest-booking-cancel"
              type="button"
              onClick={() => setConfirming(true)}
            >
              Anuluj rezerwację
            </button>
          )}
        </div>
      )}

      {confirming && booking.canCancel && (
        <div
          className="guest-booking-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cancel-booking-title"
        >
          <h2 id="cancel-booking-title">
            Czy na pewno chcesz anulować rezerwację?
          </h2>
          <p>Tej operacji nie można cofnąć.</p>
          {error && <p className="guest-booking-error">{error}</p>}
          <div>
            <button
              className="button button--danger"
              type="button"
              onClick={() => void cancel()}
              disabled={pending}
            >
              {pending ? "Anulowanie…" : "Tak, anuluj rezerwację"}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Wróć
            </button>
          </div>
        </div>
      )}
      {error && !confirming && !rescheduling && (
        <p className="guest-booking-error">{error}</p>
      )}
    </GuestShell>
  );
}

function Status({ booking }: { booking: GuestBooking }) {
  return (
    <span
      className={`guest-booking-status guest-booking-status--${booking.status}`}
    >
      {booking.status === "confirmed"
        ? booking.rescheduledAt
          ? "Termin zmieniony"
          : "Potwierdzona"
        : booking.status === "converted"
          ? "Przekształcona w lekcję"
          : "Anulowana"}
    </span>
  );
}

function GuestShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="guest-booking-page">
      <section className="guest-booking-shell">
        <Link className="guest-booking-brand" href="/">
          easy4tutor
        </Link>
        {children}
      </section>
    </main>
  );
}
