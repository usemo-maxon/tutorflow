"use client";

/* eslint-disable @next/next/no-img-element -- Supabase public URLs are runtime-selected. */
import { type FormEvent, useEffect, useState } from "react";
import type { PublicBookingEventType } from "@/lib/booking-event-types";
import { formatEventTypePrice } from "@/lib/booking-event-types";
import type { PublicBookingConfirmation } from "@/lib/public-booking";
import type {
  PublicTutorProfile,
  TutorPublicProfile,
} from "@/lib/public-profile";
import {
  BookOpen,
  CalendarDays,
  Check,
  CircleCheckBig,
  Clock3,
  MapPin,
  Monitor,
  School,
  Sparkles,
} from "lucide-react";

type PreviewProfile = TutorPublicProfile & {
  eventTypes?: PublicBookingEventType[];
};

export function PublicTutorPage({
  profile,
  preview = false,
}: {
  profile: PublicTutorProfile | PreviewProfile;
  preview?: boolean;
}) {
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<string>();
  const [availability, setAvailability] = useState<{
    timezone: string;
    days: Array<{
      date: string;
      slots: Array<{ startsAt: string; endsAt: string }>;
    }>;
  }>();
  const [availabilityError, setAvailabilityError] = useState<string>();
  const [selectedDate, setSelectedDate] = useState<string>();
  const [selectedSlot, setSelectedSlot] = useState<{
    startsAt: string;
    endsAt: string;
  }>();
  const [guest, setGuest] = useState({
    name: "",
    email: "",
    phone: "",
    level: "",
    goal: "",
    message: "",
    website: "",
  });
  const [bookingPending, setBookingPending] = useState(false);
  const [bookingError, setBookingError] = useState<string>();
  const [confirmation, setConfirmation] = useState<PublicBookingConfirmation>();
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);
  const formats = profile.lessonFormats.map((format) =>
    format === "online" ? "Online" : "Stacjonarnie",
  );
  const eventTypes = profile.eventTypes ?? [];
  const selectedEventType = eventTypes.find(
    (eventType) => eventType.id === selectedEventTypeId,
  );
  const visibleDay = availability?.days.find(
    (day) => day.date === selectedDate,
  );

  useEffect(() => {
    if (!selectedEventType || preview) return;
    const controller = new AbortController();
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    void fetch(
      `/api/public/tutors/${encodeURIComponent(profile.slug)}/availability?eventTypeId=${encodeURIComponent(selectedEventType.id)}&startDate=${startDate}&endDate=${endDate}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Nie udało się pobrać wolnych terminów.");
        return response.json() as Promise<NonNullable<typeof availability>>;
      })
      .then((result) => {
        setAvailability(result);
        setAvailabilityError(undefined);
        setSelectedDate(
          result.days.find((day) => day.slots.length)?.date ??
            result.days[0]?.date,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setAvailabilityError(
          "Nie udało się pobrać wolnych terminów. Spróbuj ponownie.",
        );
      });
    return () => controller.abort();
  }, [availabilityRefresh, preview, profile.slug, selectedEventType]);

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEventType || !selectedSlot) return;
    setBookingPending(true);
    setBookingError(undefined);
    try {
      const response = await fetch(
        `/api/public/tutors/${encodeURIComponent(profile.slug)}/bookings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventTypeId: selectedEventType.id,
            startsAt: selectedSlot.startsAt,
            ...guest,
          }),
        },
      );
      const body = (await response.json()) as
        PublicBookingConfirmation | { message?: string; code?: string };
      if (!response.ok) {
        if (response.status === 409) {
          setSelectedSlot(undefined);
          setAvailability(undefined);
          setAvailabilityRefresh((value) => value + 1);
        }
        throw new Error(
          "message" in body && body.message
            ? body.message
            : "Nie udało się umówić lekcji. Spróbuj ponownie.",
        );
      }
      const confirmed = body as PublicBookingConfirmation;
      setConfirmation(confirmed);
      window.location.assign(confirmed.managementUrl);
    } catch (error) {
      setBookingError(
        error instanceof Error
          ? error.message
          : "Nie udało się umówić lekcji. Spróbuj ponownie.",
      );
    } finally {
      setBookingPending(false);
    }
  };

  const dateLabel = (date: string, long = false) =>
    new Intl.DateTimeFormat("pl-PL", {
      weekday: long ? "long" : "short",
      day: "numeric",
      month: long ? "long" : "short",
    }).format(new Date(`${date}T12:00:00Z`));
  const timeLabel = (timestamp: string, timezone: string) =>
    new Intl.DateTimeFormat("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date(timestamp));

  return (
    <main className="public-tutor-page">
      {preview && (
        <p className="public-preview-label">
          Podgląd — nieopublikowane zmiany są widoczne tylko dla Ciebie
        </p>
      )}
      <section className="public-tutor-hero">
        <div className="public-tutor-photo" aria-hidden={!profile.photoUrl}>
          {profile.photoUrl ? (
            <img src={profile.photoUrl} alt="" />
          ) : (
            <span>
              {profile.publicName.slice(0, 1).toLocaleUpperCase("pl")}
            </span>
          )}
        </div>
        <div>
          <p className="public-tutor-brand">
            <Sparkles size={15} /> easy4tutor
          </p>
          <h1>{profile.publicName}</h1>
          {profile.headline && (
            <p className="public-tutor-headline">{profile.headline}</p>
          )}
        </div>
        {(profile.subjects.length > 0 ||
          formats.length > 0 ||
          profile.city) && (
          <div className="public-tutor-meta">
            {profile.subjects.length > 0 && (
              <span>
                <BookOpen size={16} />
                {profile.subjects.join(" · ")}
                {profile.levels.length > 0 && ` · ${profile.levels.join(", ")}`}
              </span>
            )}
            {formats.length > 0 && (
              <span>
                <Monitor size={16} />
                {formats.join(" · ")}
                {profile.city && ` · ${profile.city}`}
              </span>
            )}
            {!formats.length && profile.city && (
              <span>
                <MapPin size={16} />
                {profile.city}
              </span>
            )}
          </div>
        )}
        {eventTypes.length > 0 && (
          <a
            className="public-book-button"
            href={selectedEventType ? "#termin" : "#wybierz-rodzaj-lekcji"}
          >
            {selectedEventType ? "Wybierz termin" : "Umów lekcję"}
          </a>
        )}
      </section>
      <div className="public-tutor-content">
        {profile.about && (
          <section>
            <h2>O mnie</h2>
            <p className="public-tutor-about">{profile.about}</p>
          </section>
        )}
        {profile.subjects.length > 0 && (
          <section>
            <h2>Jak mogę Ci pomóc?</h2>
            <ul className="public-tutor-chips">
              {profile.subjects.map((subject) => (
                <li key={subject}>{subject}</li>
              ))}
            </ul>
          </section>
        )}
        {(profile.levels.length > 0 ||
          formats.length > 0 ||
          profile.priceText) && (
          <section>
            <h2>Informacje</h2>
            <dl className="public-tutor-facts">
              {profile.levels.length > 0 && (
                <div>
                  <dt>Poziomy</dt>
                  <dd>{profile.levels.join(", ")}</dd>
                </div>
              )}
              {formats.length > 0 && (
                <div>
                  <dt>Format</dt>
                  <dd>{formats.join(" i ")}</dd>
                </div>
              )}
              {profile.priceText && (
                <div>
                  <dt>Cena</dt>
                  <dd>{profile.priceText}</dd>
                </div>
              )}
            </dl>
          </section>
        )}
        {profile.contactLinks.length > 0 && (
          <section>
            <h2>Znajdź mnie</h2>
            <div className="public-contact-links">
              {profile.contactLinks.map((link) => (
                <a key={link} href={link} rel="noreferrer" target="_blank">
                  Otwórz link
                </a>
              ))}
            </div>
          </section>
        )}
        {eventTypes.length > 0 && (
          <section id="wybierz-rodzaj-lekcji" className="public-event-types">
            <h2>Wybierz rodzaj lekcji</h2>
            <p>Wybierz ofertę, aby przejść do kolejnego kroku.</p>
            <div className="public-event-type-list">
              {eventTypes.map((eventType) => {
                const selected = eventType.id === selectedEventTypeId;
                return (
                  <button
                    type="button"
                    key={eventType.id}
                    className={`public-event-type-card${selected ? " public-event-type-card--selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => {
                      if (selected) return;
                      setSelectedEventTypeId(eventType.id);
                      setSelectedSlot(undefined);
                      setAvailability(undefined);
                      setAvailabilityError(undefined);
                      setSelectedDate(undefined);
                      setBookingError(undefined);
                      setConfirmation(undefined);
                    }}
                  >
                    <span className="public-event-type-card__title">
                      {eventType.name}
                    </span>
                    {eventType.description && (
                      <span className="public-event-type-card__description">
                        {eventType.description}
                      </span>
                    )}
                    <span className="public-event-type-card__meta">
                      <Clock3 size={16} />
                      {eventType.durationMinutes} min ·{" "}
                      {eventType.format === "online"
                        ? "Online"
                        : "Stacjonarnie"}
                    </span>
                    <span className="public-event-type-card__price">
                      {formatEventTypePrice(
                        eventType.priceGrosz,
                        eventType.currency,
                      )}
                    </span>
                    <span className="public-event-type-card__action">
                      {selected ? (
                        <>
                          <Check size={16} /> Wybrano
                        </>
                      ) : (
                        "Wybierz"
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {selectedEventType && (
          <section id="termin" className="public-availability">
            <div className="public-availability__heading">
              <CalendarDays size={23} />
              <div>
                <h2>Wybierz termin</h2>
                {availability && (
                  <p>Godziny według strefy {availability.timezone}</p>
                )}
              </div>
            </div>
            {preview ? (
              <p className="public-availability__notice">
                Terminy pojawią się na opublikowanej stronie po wybraniu rodzaju
                zajęć.
              </p>
            ) : !availability && !availabilityError ? (
              <p className="public-availability__notice" aria-live="polite">
                Sprawdzamy wolne terminy…
              </p>
            ) : availabilityError ? (
              <p
                className="public-availability__notice public-availability__notice--error"
                role="alert"
              >
                {availabilityError}
              </p>
            ) : (
              <>
                <div
                  className="public-availability__dates"
                  role="tablist"
                  aria-label="Wybierz dzień"
                >
                  {availability?.days.map((day) => {
                    const active = day.date === selectedDate;
                    return (
                      <button
                        type="button"
                        key={day.date}
                        className={`public-availability__date${active ? " public-availability__date--selected" : ""}`}
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          setSelectedDate(day.date);
                          setSelectedSlot(undefined);
                          setBookingError(undefined);
                        }}
                      >
                        {dateLabel(day.date)}
                      </button>
                    );
                  })}
                </div>
                {visibleDay?.slots.length ? (
                  <div
                    className="public-availability__slots"
                    aria-label={`Wolne terminy: ${dateLabel(visibleDay.date, true)}`}
                  >
                    {visibleDay.slots.map((slot) => {
                      const selected = selectedSlot?.startsAt === slot.startsAt;
                      return (
                        <button
                          type="button"
                          key={slot.startsAt}
                          className={`public-availability__slot${selected ? " public-availability__slot--selected" : ""}`}
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedSlot(slot);
                            setBookingError(undefined);
                          }}
                        >
                          {timeLabel(slot.startsAt, availability!.timezone)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="public-availability__empty">
                    Brak wolnych terminów w tym dniu.
                  </p>
                )}
              </>
            )}
            {selectedSlot && availability && (
              <div className="public-availability__summary" aria-live="polite">
                <strong>{selectedEventType.name}</strong>
                <span>
                  {selectedEventType.durationMinutes} min ·{" "}
                  {formatEventTypePrice(
                    selectedEventType.priceGrosz,
                    selectedEventType.currency,
                  )}
                </span>
                <span>
                  {dateLabel(selectedDate ?? "", true)} ·{" "}
                  {timeLabel(selectedSlot.startsAt, availability.timezone)}–
                  {timeLabel(selectedSlot.endsAt, availability.timezone)}
                </span>
                <small>Termin zostanie potwierdzony w kolejnym kroku.</small>
              </div>
            )}
          </section>
        )}
        {selectedEventType && selectedSlot && availability && !preview && (
          <section id="twoje-dane" className="public-booking-form-section">
            {confirmation ? (
              <div className="public-booking-success" aria-live="polite">
                <CircleCheckBig size={34} />
                <div>
                  <p className="public-booking-success__eyebrow">Gotowe!</p>
                  <h2>Twoja lekcja została zarezerwowana.</h2>
                  <div className="public-booking-success__details">
                    <strong>{profile.publicName}</strong>
                    <span>{confirmation.eventTypeName}</span>
                    <span>
                      {new Intl.DateTimeFormat("pl-PL", {
                        day: "numeric",
                        month: "long",
                        timeZone: confirmation.timezone,
                      }).format(new Date(confirmation.startsAt))}
                      {" · "}
                      {timeLabel(confirmation.startsAt, confirmation.timezone)}–
                      {timeLabel(confirmation.endsAt, confirmation.timezone)}
                    </span>
                    <span>
                      Rezerwacja dla: <strong>{confirmation.guestEmail}</strong>
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={submitBooking} className="public-booking-form">
                <div>
                  <h2>Twoje dane</h2>
                  <p>Nie potrzebujesz konta easy4tutor.</p>
                </div>
                <div className="public-booking-form__fields">
                  <label>
                    <span>
                      Imię <span aria-hidden="true">*</span>
                    </span>
                    <input
                      name="name"
                      required
                      maxLength={120}
                      autoComplete="name"
                      value={guest.name}
                      onChange={(event) =>
                        setGuest({ ...guest, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      E-mail <span aria-hidden="true">*</span>
                    </span>
                    <input
                      name="email"
                      type="email"
                      required
                      maxLength={255}
                      autoComplete="email"
                      value={guest.email}
                      onChange={(event) =>
                        setGuest({ ...guest, email: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Telefon
                    <input
                      name="phone"
                      type="tel"
                      maxLength={50}
                      autoComplete="tel"
                      value={guest.phone}
                      onChange={(event) =>
                        setGuest({ ...guest, phone: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Poziom
                    <input
                      name="level"
                      maxLength={80}
                      value={guest.level}
                      onChange={(event) =>
                        setGuest({ ...guest, level: event.target.value })
                      }
                    />
                  </label>
                  <label className="public-booking-form__wide">
                    Cel nauki
                    <input
                      name="goal"
                      maxLength={500}
                      value={guest.goal}
                      onChange={(event) =>
                        setGuest({ ...guest, goal: event.target.value })
                      }
                    />
                  </label>
                  <label className="public-booking-form__wide">
                    Wiadomość
                    <textarea
                      name="message"
                      rows={3}
                      maxLength={2000}
                      value={guest.message}
                      onChange={(event) =>
                        setGuest({ ...guest, message: event.target.value })
                      }
                    />
                  </label>
                  <label className="public-booking-honeypot" aria-hidden="true">
                    Strona internetowa
                    <input
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={guest.website}
                      onChange={(event) =>
                        setGuest({ ...guest, website: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="public-booking-summary">
                  <strong>{profile.publicName}</strong>
                  <span>{selectedEventType.name}</span>
                  <span>
                    {selectedEventType.durationMinutes} min ·{" "}
                    {formatEventTypePrice(
                      selectedEventType.priceGrosz,
                      selectedEventType.currency,
                    )}
                  </span>
                  <span>
                    {dateLabel(selectedDate ?? "", true)} ·{" "}
                    {timeLabel(selectedSlot.startsAt, availability.timezone)}–
                    {timeLabel(selectedSlot.endsAt, availability.timezone)}
                  </span>
                </div>
                {bookingError && (
                  <p className="public-booking-error" role="alert">
                    {bookingError}
                  </p>
                )}
                <button
                  className="public-booking-submit"
                  type="submit"
                  disabled={bookingPending}
                >
                  {bookingPending ? "Rezerwujemy…" : "Umów lekcję"}
                </button>
              </form>
            )}
          </section>
        )}
        {!eventTypes.length && (
          <section className="public-booking-soon">
            <School size={23} />
            <div>
              <h2>Oferta jest przygotowywana</h2>
              <p>Rodzaje zajęć pojawią się tutaj wkrótce.</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
