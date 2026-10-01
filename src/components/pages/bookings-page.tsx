"use client";

import {
  ArrowLeft,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Mail,
  Phone,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ClientApiError,
  convertTutorBooking,
  fetchTutorBooking,
  fetchTutorBookings,
} from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/format";
import type {
  BookingConversionDraft,
  PublicBookingRecord,
  TutorBookingDetail,
} from "@/lib/public-booking";

export function BookingsPage() {
  const [bookings, setBookings] = useState<PublicBookingRecord[]>([]);
  const [selected, setSelected] = useState<TutorBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchTutorBookings(controller.signal)
      .then(setBookings)
      .catch((reason) => setError(messageFor(reason)))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function openBooking(bookingId: string) {
    setDetailLoading(true);
    setError("");
    try {
      setSelected(await fetchTutorBooking(bookingId));
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setDetailLoading(false);
    }
  }

  function updateConverted(detail: TutorBookingDetail) {
    setSelected(detail);
    setBookings((items) =>
      items.map((item) =>
        item.bookingId === detail.bookingId ? { ...item, ...detail } : item,
      ),
    );
  }

  return (
    <section className="bookings-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Rezerwacje publiczne</span>
          <h1>Rezerwacje</h1>
          <p className="page-intro">
            Sprawdź dane gościa i zdecyduj, kiedy dodać go do uczniów.
          </p>
        </div>
      </header>

      {error && <p className="booking-alert" role="alert">{error}</p>}
      {loading ? (
        <div className="panel booking-empty">Ładowanie rezerwacji…</div>
      ) : bookings.length === 0 ? (
        <div className="panel booking-empty">
          <CalendarCheck2 size={24} aria-hidden="true" />
          <strong>Brak nadchodzących rezerwacji</strong>
          <span>Nowe zapisy z Twojej strony publicznej pojawią się tutaj.</span>
        </div>
      ) : (
        <div className={`booking-layout${selected ? " booking-layout--detail" : ""}`}>
          <div className="booking-list" aria-label="Nadchodzące rezerwacje">
            {bookings.map((booking) => (
              <button
                key={booking.bookingId}
                type="button"
                className={`booking-card${selected?.bookingId === booking.bookingId ? " booking-card--active" : ""}`}
                onClick={() => openBooking(booking.bookingId)}
              >
                <span className="booking-card__topline">
                  <strong>{booking.guestName}</strong>
                  <BookingStatus status={booking.status} />
                </span>
                <span className="booking-card__time">
                  <Clock3 size={16} aria-hidden="true" />
                  {formatDateTime(booking.startsAt, booking.timezone)}
                </span>
                <span>{booking.eventTypeName}</span>
                <small>{booking.guestEmail}</small>
              </button>
            ))}
          </div>
          {detailLoading ? (
            <div className="panel booking-detail booking-empty">Ładowanie szczegółów…</div>
          ) : selected ? (
            <BookingDetail
              key={selected.bookingId}
              booking={selected}
              onBack={() => setSelected(null)}
              onConverted={updateConverted}
            />
          ) : (
            <div className="panel booking-detail booking-empty booking-detail-placeholder">
              Wybierz rezerwację, aby zobaczyć szczegóły.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BookingDetail({
  booking,
  onBack,
  onConverted,
}: {
  booking: TutorBookingDetail;
  onBack: () => void;
  onConverted: (booking: TutorBookingDetail) => void;
}) {
  const [draft, setDraft] = useState<BookingConversionDraft>(
    booking.proposedStudent,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function convert(
    input:
      | { mode: "existing"; studentId: string }
      | { mode: "new"; student: BookingConversionDraft },
  ) {
    setSubmitting(true);
    setError("");
    try {
      const result = await convertTutorBooking(booking.bookingId, input);
      onConverted({
        ...booking,
        status: "converted",
        studentId: result.studentId,
        lessonId: result.lessonId,
        convertedAt: result.convertedAt,
      });
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="panel booking-detail">
      <button type="button" className="button button--quiet booking-back" onClick={onBack}>
        <ArrowLeft size={17} aria-hidden="true" /> Wróć do listy
      </button>
      <div className="booking-detail__heading">
        <div>
          <span className="eyebrow">{booking.eventTypeName}</span>
          <h2>{booking.guestName}</h2>
        </div>
        <BookingStatus status={booking.status} />
      </div>

      <dl className="booking-facts">
        <Fact label="Termin" value={formatDateTime(booking.startsAt, booking.timezone)} />
        <Fact label="Czas" value={`${booking.durationMinutes} min`} />
        <Fact label="Cena" value={formatMoney({ amount: booking.priceGrosz, currency: booking.currency })} />
        <Fact label="Format" value={booking.format === "online" ? "Online" : "Stacjonarnie"} />
        <Fact label="Poziom" value={booking.guestLevel || "Nie podano"} />
        <Fact label="Cel" value={booking.guestGoal || "Nie podano"} />
      </dl>
      <div className="booking-contact-lines">
        <a href={`mailto:${booking.guestEmail}`}><Mail size={16} />{booking.guestEmail}</a>
        {booking.guestPhone && <a href={`tel:${booking.guestPhone}`}><Phone size={16} />{booking.guestPhone}</a>}
      </div>
      {booking.guestMessage && (
        <div className="booking-message">
          <span>Wiadomość od gościa</span>
          <p>{booking.guestMessage}</p>
        </div>
      )}

      {booking.status === "converted" && booking.studentId && booking.lessonId ? (
        <div className="booking-converted">
          <CheckCircle2 size={22} aria-hidden="true" />
          <div>
            <strong>Dodano jako ucznia</strong>
            <span>Rezerwacja jest połączona z normalną lekcją easy4tutor.</span>
          </div>
          <div className="booking-actions">
            <Link className="button button--secondary" href={`/app/uczniowie/${booking.studentId}`}>Otwórz ucznia</Link>
            <Link className="button button--primary" href={`/app/lekcje/${booking.lessonId}`}>Otwórz lekcję</Link>
          </div>
        </div>
      ) : (
        <div className="booking-conversion">
          <div>
            <span className="eyebrow">Konwersja</span>
            <h3>Dodaj jako ucznia</h3>
            <p>Sprawdź dane przed utworzeniem profilu. Historia rezerwacji pozostanie bez zmian.</p>
          </div>
          {booking.matchingStudents.length > 0 && (
            <div className="booking-matches">
              <strong>Możliwy istniejący uczeń</strong>
              <p>Dopasowanie jest tylko sugestią — połączenie wymaga Twojego potwierdzenia.</p>
              {booking.matchingStudents.map((student) => (
                <div className="booking-match" key={student.id}>
                  <span><b>{student.displayName}</b><small>{student.email || student.phone}</small></span>
                  <button className="button button--secondary" disabled={submitting} onClick={() => convert({ mode: "existing", studentId: student.id })}>Połącz z istniejącym uczniem</button>
                </div>
              ))}
            </div>
          )}
          <div className="booking-student-form">
            <label className="field"><span>Imię</span><input value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} /></label>
            <label className="field"><span>Nazwisko</span><input value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} /></label>
            <label className="field"><span>E-mail</span><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
            <label className="field"><span>Telefon</span><input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
            <label className="field"><span>Poziom</span><input value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })} /></label>
            <label className="field booking-student-form__wide"><span>Cel / kontekst nauki</span><textarea rows={3} value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} /></label>
          </div>
          {error && <p className="booking-alert" role="alert">{error}</p>}
          <button className="button button--primary button--large booking-convert-button" disabled={submitting || !draft.firstName.trim()} onClick={() => convert({ mode: "new", student: draft })}>
            <UserPlus size={18} aria-hidden="true" />
            {submitting ? "Dodawanie…" : "Dodaj jako ucznia"}
          </button>
        </div>
      )}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function BookingStatus({ status }: { status: PublicBookingRecord["status"] }) {
  return <span className={`booking-status booking-status--${status}`}>{status === "converted" ? "Dodano jako ucznia" : status === "cancelled" ? "Anulowana" : "Potwierdzona"}</span>;
}

function messageFor(reason: unknown): string {
  if (reason instanceof ClientApiError) return reason.data.message;
  if (reason instanceof DOMException && reason.name === "AbortError") return "";
  return "Nie udało się pobrać danych. Spróbuj ponownie.";
}
