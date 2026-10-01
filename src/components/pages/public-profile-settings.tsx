"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  EMPTY_BOOKING_EVENT_TYPE,
  groszToPriceInput,
  priceInputToGrosz,
  type BookingEventType,
  type BookingEventTypeInput,
} from "@/lib/booking-event-types";
import type { TutorPublicProfile } from "@/lib/public-profile";
import { normalizePublicSlug } from "@/lib/public-profile";
import { PublicTutorPage } from "@/components/public-tutor-page";
import {
  DEFAULT_BOOKING_AVAILABILITY,
  type BookingAvailabilitySettings,
} from "@/lib/public-availability";
import { useSessionTeacher } from "../app-shell";

const split = (value: string) =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
type EventTypeDraft = BookingEventTypeInput & {
  id?: string;
  priceInput: string;
};
const newDraft = (): EventTypeDraft => ({
  ...EMPTY_BOOKING_EVENT_TYPE,
  priceInput: "0",
});
const draftFromEventType = (eventType: BookingEventType): EventTypeDraft => ({
  ...eventType,
  priceInput: groszToPriceInput(eventType.priceGrosz),
});

export function PublicProfileSettings() {
  const teacher = useSessionTeacher();
  const [profile, setProfile] = useState<TutorPublicProfile | null>(null);
  const [eventTypes, setEventTypes] = useState<BookingEventType[]>([]);
  const [availabilitySettings, setAvailabilitySettings] =
    useState<BookingAvailabilitySettings>(DEFAULT_BOOKING_AVAILABILITY);
  const [draft, setDraft] = useState<EventTypeDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingEventType, setSavingEventType] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void Promise.all([
      fetch("/api/public-profile", { cache: "no-store" }).then(
        async (response) => ({ response, data: await response.json() }),
      ),
      fetch("/api/booking-event-types", { cache: "no-store" }).then(
        async (response) => ({ response, data: await response.json() }),
      ),
      fetch("/api/booking-availability", { cache: "no-store" }).then(
        async (response) => ({ response, data: await response.json() }),
      ),
    ])
      .then(([profileResult, eventTypesResult, availabilityResult]) => {
        if (
          !profileResult.response.ok ||
          !eventTypesResult.response.ok ||
          !availabilityResult.response.ok
        )
          throw new Error("LOAD_FAILED");
        setProfile(profileResult.data as TutorPublicProfile);
        setEventTypes(eventTypesResult.data as BookingEventType[]);
        setAvailabilitySettings({
          ...DEFAULT_BOOKING_AVAILABILITY,
          ...(availabilityResult.data as BookingAvailabilitySettings),
        });
      })
      .catch(() => setMessage("Nie udało się pobrać ustawień."));
  }, []);

  const update = <K extends keyof TutorPublicProfile>(
    key: K,
    value: TutorPublicProfile[K],
  ) =>
    setProfile((current) => (current ? { ...current, [key]: value } : current));
  const updateDraft = <K extends keyof EventTypeDraft>(
    key: K,
    value: EventTypeDraft[K],
  ) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/public-profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profile),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok)
      return setMessage(data.message || "Nie udało się zapisać.");
    setProfile(data);
    setMessage("Zmiany strony zapisane.");
  }

  async function photo(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.set("photo", file);
    const response = await fetch("/api/public-profile/photo", {
      method: "POST",
      body: form,
    });
    const data = await response.json();
    if (!response.ok)
      return setMessage(data.message || "Nie udało się przesłać zdjęcia.");
    update("photoUrl", data.photoUrl);
  }

  async function saveAvailabilitySettings() {
    setSavingAvailability(true);
    setMessage("");
    try {
      const response = await fetch("/api/booking-availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(availabilitySettings),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Nie udało się zapisać ustawień.");
      setAvailabilitySettings(data as BookingAvailabilitySettings);
      setMessage("Ustawienia dostępności zapisane.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać ustawień.",
      );
    } finally {
      setSavingAvailability(false);
    }
  }

  async function persistEventType(
    eventType: BookingEventType,
    next?: BookingEventType[],
  ) {
    const response = await fetch(`/api/booking-event-types/${eventType.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(eventType),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Nie udało się zapisać rodzaju zajęć.");
    setEventTypes(
      next ??
        eventTypes.map((item) =>
          item.id === eventType.id ? (data as BookingEventType) : item,
        ),
    );
    return data as BookingEventType;
  }

  async function saveEventType() {
    if (!draft) return;
    const priceGrosz = priceInputToGrosz(draft.priceInput);
    if (priceGrosz === null)
      return setMessage(
        "Podaj cenę z maksymalnie dwoma miejscami po przecinku.",
      );
    setSavingEventType(true);
    setMessage("");
    const input: BookingEventTypeInput = {
      name: draft.name,
      description: draft.description,
      durationMinutes: Number(draft.durationMinutes),
      priceGrosz,
      currency: "PLN",
      format: draft.format,
      active: draft.active,
      isPublic: draft.isPublic,
      displayOrder: draft.displayOrder,
    };
    try {
      const response = await fetch(
        draft.id
          ? `/api/booking-event-types/${draft.id}`
          : "/api/booking-event-types",
        {
          method: draft.id ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Nie udało się zapisać rodzaju zajęć.");
      setEventTypes((current) =>
        draft.id
          ? current.map((item) =>
              item.id === draft.id ? (data as BookingEventType) : item,
            )
          : [...current, data as BookingEventType].sort(
              (a, b) => a.displayOrder - b.displayOrder,
            ),
      );
      setDraft(null);
      setMessage("Rodzaj zajęć zapisany.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać rodzaju zajęć.",
      );
    } finally {
      setSavingEventType(false);
    }
  }

  async function moveEventType(eventType: BookingEventType, direction: -1 | 1) {
    const currentIndex = eventTypes.findIndex(
      (item) => item.id === eventType.id,
    );
    const adjacent = eventTypes[currentIndex + direction];
    if (!adjacent) return;
    const moved = { ...eventType, displayOrder: adjacent.displayOrder };
    const swapped = { ...adjacent, displayOrder: eventType.displayOrder };
    const next = eventTypes
      .map((item) =>
        item.id === moved.id ? moved : item.id === swapped.id ? swapped : item,
      )
      .sort((a, b) => a.displayOrder - b.displayOrder);
    setSavingEventType(true);
    setMessage("");
    try {
      await Promise.all([persistEventType(moved), persistEventType(swapped)]);
      setEventTypes(next);
      setMessage("Kolejność została zmieniona.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się zmienić kolejności.",
      );
    } finally {
      setSavingEventType(false);
    }
  }

  async function removeEventType(eventType: BookingEventType) {
    if (!window.confirm(`Usunąć „${eventType.name}”?`)) return;
    setSavingEventType(true);
    setMessage("");
    try {
      const response = await fetch(`/api/booking-event-types/${eventType.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Nie udało się usunąć rodzaju zajęć.");
      }
      setEventTypes((current) =>
        current.filter((item) => item.id !== eventType.id),
      );
      setMessage("Rodzaj zajęć usunięty.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się usunąć rodzaju zajęć.",
      );
    } finally {
      setSavingEventType(false);
    }
  }

  if (!profile)
    return (
      <section className="settings-panel">
        <LoaderCircle className="spin" /> Ładowanie strony publicznej…
      </section>
    );
  const publicHref = `/${profile.slug}`;
  return (
    <section className="public-profile-settings">
      <div className="settings-copy">
        <p className="eyebrow">Widoczność w sieci</p>
        <h2>Strona publiczna</h2>
        <p>
          Ty decydujesz, co zobaczą potencjalni uczniowie. Dane konta i
          informacje z obszaru pracy nigdy nie trafiają na tę stronę.
        </p>
      </div>
      <div className="public-settings-layout">
        <div className="public-settings-stack">
          <form
            className="settings-form public-settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveProfile();
            }}
          >
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={profile.enabled}
                onChange={(event) => update("enabled", event.target.checked)}
                disabled={teacher.subscription.readOnly}
              />
              <span>
                <strong>
                  {profile.enabled ? "Strona opublikowana" : "Strona wyłączona"}
                </strong>
                <small>
                  {profile.enabled
                    ? "Jest dostępna pod wybranym adresem."
                    : "Adres nie pokazuje Twojego profilu."}
                </small>
              </span>
            </label>
            <label className="field">
              <span>Publiczny adres</span>
              <div className="public-slug-field">
                <span>easy4tutor.pl/</span>
                <input
                  value={profile.slug}
                  onChange={(event) =>
                    update("slug", normalizePublicSlug(event.target.value))
                  }
                  disabled={teacher.subscription.readOnly}
                />
              </div>
              <small>3–60 znaków: małe litery, cyfry i myślniki.</small>
            </label>
            <label className="field">
              <span>Publiczna nazwa</span>
              <input
                value={profile.publicName}
                onChange={(event) => update("publicName", event.target.value)}
                disabled={teacher.subscription.readOnly}
              />
            </label>
            <label className="field">
              <span>Zdjęcie profilowe</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void photo(event.target.files?.[0])}
                disabled={teacher.subscription.readOnly}
              />
              <small>JPG, PNG lub WebP, maks. 3 MB.</small>
            </label>
            <label className="field">
              <span>Hasło pod nazwą</span>
              <input
                value={profile.headline ?? ""}
                onChange={(event) => update("headline", event.target.value)}
                disabled={teacher.subscription.readOnly}
                placeholder="np. Angielski bez stresu"
              />
            </label>
            <label className="field">
              <span>O mnie</span>
              <textarea
                rows={5}
                value={profile.about ?? ""}
                onChange={(event) => update("about", event.target.value)}
                disabled={teacher.subscription.readOnly}
              />
            </label>
            <label className="field">
              <span>Przedmioty lub tematy</span>
              <input
                value={profile.subjects.join(", ")}
                onChange={(event) =>
                  update("subjects", split(event.target.value))
                }
                disabled={teacher.subscription.readOnly}
                placeholder="Angielski, konwersacje"
              />
            </label>
            <label className="field">
              <span>Poziomy</span>
              <input
                value={profile.levels.join(", ")}
                onChange={(event) =>
                  update("levels", split(event.target.value))
                }
                disabled={teacher.subscription.readOnly}
                placeholder="A2–C1, matura"
              />
            </label>
            <label className="field">
              <span>Format lekcji</span>
              <select
                value={profile.lessonFormats.join(",")}
                onChange={(event) =>
                  update(
                    "lessonFormats",
                    event.target.value
                      ? (event.target.value.split(
                          ",",
                        ) as TutorPublicProfile["lessonFormats"])
                      : [],
                  )
                }
                disabled={teacher.subscription.readOnly}
              >
                <option value="">Nie pokazuj</option>
                <option value="online">Online</option>
                <option value="offline">Stacjonarnie</option>
                <option value="online,offline">Online i stacjonarnie</option>
              </select>
            </label>
            <label className="field">
              <span>Miasto / lokalizacja</span>
              <input
                value={profile.city ?? ""}
                onChange={(event) => update("city", event.target.value)}
                disabled={teacher.subscription.readOnly}
              />
            </label>
            <label className="field">
              <span>Cena (opcjonalnie)</span>
              <input
                value={profile.priceText ?? ""}
                onChange={(event) => update("priceText", event.target.value)}
                disabled={teacher.subscription.readOnly}
                placeholder="np. od 100 zł / 60 min"
              />
            </label>
            <label className="field">
              <span>Linki kontaktowe</span>
              <textarea
                rows={3}
                value={profile.contactLinks.join("\n")}
                onChange={(event) =>
                  update("contactLinks", split(event.target.value))
                }
                disabled={teacher.subscription.readOnly}
                placeholder="https://instagram.com/..."
              />
            </label>
            <div className="public-settings-actions">
              <button
                className="button button--primary"
                disabled={saving || teacher.subscription.readOnly}
              >
                {saving && <LoaderCircle size={16} className="spin" />}
                {profile.enabled
                  ? "Zapisz opublikowaną stronę"
                  : "Zapisz stronę"}
              </button>
              <Link
                className="button button--secondary"
                href={publicHref}
                target="_blank"
              >
                <ExternalLink size={16} />
                Otwórz stronę publiczną
              </Link>
            </div>
          </form>
          <form
            className="settings-form event-type-settings"
            onSubmit={(event) => {
              event.preventDefault();
              void saveAvailabilitySettings();
            }}
          >
            <div className="event-type-settings__heading">
              <div>
                <p className="eyebrow">Rezerwacje</p>
                <h2>Dostępność dla odwiedzających</h2>
                <p>
                  Te reguły dotyczą wyłącznie terminów wyświetlanych na stronie
                  publicznej. Kalendarz i wyjątki nadal pozostają źródłem
                  prawdy.
                </p>
              </div>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Minimalne wyprzedzenie (godz.)</span>
                <input
                  type="number"
                  min="0"
                  max="720"
                  value={availabilitySettings.minimumNoticeHours}
                  onChange={(event) =>
                    setAvailabilitySettings((current) => ({
                      ...current,
                      minimumNoticeHours: Number(event.target.value),
                    }))
                  }
                  disabled={teacher.subscription.readOnly}
                />
              </label>
              <label className="field">
                <span>Rezerwacja do przodu (dni)</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={availabilitySettings.bookingHorizonDays}
                  onChange={(event) =>
                    setAvailabilitySettings((current) => ({
                      ...current,
                      bookingHorizonDays: Number(event.target.value),
                    }))
                  }
                  disabled={teacher.subscription.readOnly}
                />
              </label>
              <label className="field">
                <span>Możliwość anulowania do</span>
                <select
                  value={availabilitySettings.cancellationNoticeHours}
                  onChange={(event) =>
                    setAvailabilitySettings((current) => ({
                      ...current,
                      cancellationNoticeHours: Number(event.target.value),
                    }))
                  }
                  disabled={teacher.subscription.readOnly}
                >
                  <option value={12}>12 h przed lekcją</option>
                  <option value={24}>24 h przed lekcją</option>
                  <option value={48}>48 h przed lekcją</option>
                </select>
              </label>
              <label className="field">
                <span>Zmiana terminu do</span>
                <select
                  value={
                    availabilitySettings.rescheduleNoticeHours ??
                    DEFAULT_BOOKING_AVAILABILITY.rescheduleNoticeHours
                  }
                  onChange={(event) =>
                    setAvailabilitySettings((current) => ({
                      ...current,
                      rescheduleNoticeHours: Number(event.target.value),
                    }))
                  }
                  disabled={teacher.subscription.readOnly}
                >
                  <option value={12}>12 h przed lekcją</option>
                  <option value={24}>24 h przed lekcją</option>
                  <option value={48}>48 h przed lekcją</option>
                </select>
              </label>
            </div>
            <div className="booking-reminder-settings">
              <div>
                <strong>Przypomnienia dla rezerwacji</strong>
                <small>
                  Wiadomość e-mail jest wysyłana gościowi dzień przed lekcją.
                </small>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={
                    availabilitySettings.reminder24HoursEnabled ??
                    DEFAULT_BOOKING_AVAILABILITY.reminder24HoursEnabled
                  }
                  onChange={(event) =>
                    setAvailabilitySettings((current) => ({
                      ...current,
                      reminder24HoursEnabled: event.target.checked,
                    }))
                  }
                  disabled={teacher.subscription.readOnly}
                />
                Dzień przed (e-mail)
              </label>
            </div>
            <p className="form-note">
              Domyślnie: 12 godzin wyprzedzenia, 30 dni do przodu i anulowanie
              oraz zmiana terminu do 24 godzin przed lekcją. Sloty są
              wyświetlane co 15 minut.
            </p>
            <div className="public-settings-actions">
              <button
                className="button button--primary"
                disabled={savingAvailability || teacher.subscription.readOnly}
              >
                {savingAvailability && (
                  <LoaderCircle size={16} className="spin" />
                )}
                Zapisz dostępność
              </button>
            </div>
          </form>
          <section className="settings-form event-type-settings">
            <div className="event-type-settings__heading">
              <div>
                <p className="eyebrow">Oferta</p>
                <h2>Typy zajęć</h2>
                <p>
                  Dodaj lekcje, które odwiedzający mogą wybrać przed ustaleniem
                  terminu.
                </p>
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setDraft(newDraft())}
                disabled={teacher.subscription.readOnly || Boolean(draft)}
              >
                <Plus size={16} />
                Dodaj
              </button>
            </div>
            {eventTypes.length === 0 && !draft && (
              <p className="inline-empty">
                Nie masz jeszcze typów zajęć. Możesz dodać np. pierwsze
                spotkanie lub lekcję indywidualną.
              </p>
            )}
            <div className="event-type-list">
              {eventTypes.map((eventType, index) => (
                <article className="event-type-row" key={eventType.id}>
                  <div>
                    <strong>{eventType.name}</strong>
                    <p>
                      {eventType.durationMinutes} min ·{" "}
                      {eventType.format === "online"
                        ? "Online"
                        : "Stacjonarnie"}{" "}
                      ·{" "}
                      {eventType.priceGrosz === 0
                        ? "Bezpłatnie"
                        : `${groszToPriceInput(eventType.priceGrosz)} zł`}
                    </p>
                    <small>
                      {eventType.active && eventType.isPublic
                        ? "Widoczny publicznie"
                        : eventType.active
                          ? "Ukryty publicznie"
                          : "Wyłączony"}
                    </small>
                  </div>
                  <div className="event-type-row__actions">
                    <button
                      type="button"
                      className="icon-button icon-button--border"
                      aria-label={`Przesuń ${eventType.name} wyżej`}
                      onClick={() => void moveEventType(eventType, -1)}
                      disabled={
                        savingEventType ||
                        index === 0 ||
                        teacher.subscription.readOnly
                      }
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--border"
                      aria-label={`Przesuń ${eventType.name} niżej`}
                      onClick={() => void moveEventType(eventType, 1)}
                      disabled={
                        savingEventType ||
                        index === eventTypes.length - 1 ||
                        teacher.subscription.readOnly
                      }
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--border"
                      aria-label={`Edytuj ${eventType.name}`}
                      onClick={() => setDraft(draftFromEventType(eventType))}
                      disabled={
                        savingEventType || teacher.subscription.readOnly
                      }
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--border event-type-delete"
                      aria-label={`Usuń ${eventType.name}`}
                      onClick={() => void removeEventType(eventType)}
                      disabled={
                        savingEventType || teacher.subscription.readOnly
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {draft && (
              <form
                className="event-type-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEventType();
                }}
              >
                <div className="event-type-editor__heading">
                  <h3>{draft.id ? "Edytuj typ zajęć" : "Nowy typ zajęć"}</h3>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Zamknij formularz"
                    onClick={() => setDraft(null)}
                    disabled={savingEventType}
                  >
                    <X size={18} />
                  </button>
                </div>
                <label className="field">
                  <span>Nazwa</span>
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      updateDraft("name", event.target.value)
                    }
                    maxLength={120}
                    required
                    disabled={teacher.subscription.readOnly}
                  />
                </label>
                <label className="field">
                  <span>Krótki opis</span>
                  <textarea
                    rows={3}
                    value={draft.description ?? ""}
                    onChange={(event) =>
                      updateDraft("description", event.target.value)
                    }
                    maxLength={500}
                    disabled={teacher.subscription.readOnly}
                  />
                </label>
                <div className="form-row">
                  <label className="field">
                    <span>Czas trwania (min)</span>
                    <input
                      type="number"
                      min="1"
                      max="720"
                      value={draft.durationMinutes}
                      onChange={(event) =>
                        updateDraft(
                          "durationMinutes",
                          Number(event.target.value),
                        )
                      }
                      required
                      disabled={teacher.subscription.readOnly}
                    />
                  </label>
                  <label className="field">
                    <span>Cena (zł)</span>
                    <input
                      inputMode="decimal"
                      value={draft.priceInput}
                      onChange={(event) =>
                        updateDraft("priceInput", event.target.value)
                      }
                      required
                      disabled={teacher.subscription.readOnly}
                    />
                    <small>0 oznacza bezpłatnie.</small>
                  </label>
                </div>
                <label className="field">
                  <span>Format</span>
                  <select
                    value={draft.format}
                    onChange={(event) =>
                      updateDraft(
                        "format",
                        event.target.value as BookingEventTypeInput["format"],
                      )
                    }
                    disabled={teacher.subscription.readOnly}
                  >
                    <option value="online">Online</option>
                    <option value="offline">Stacjonarnie</option>
                  </select>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) =>
                      updateDraft("active", event.target.checked)
                    }
                    disabled={teacher.subscription.readOnly}
                  />
                  Aktywny typ zajęć
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={draft.isPublic}
                    onChange={(event) =>
                      updateDraft("isPublic", event.target.checked)
                    }
                    disabled={teacher.subscription.readOnly}
                  />
                  Pokazuj na stronie publicznej
                </label>
                <div className="public-settings-actions">
                  <button
                    className="button button--primary"
                    disabled={savingEventType || teacher.subscription.readOnly}
                  >
                    {savingEventType && (
                      <LoaderCircle size={16} className="spin" />
                    )}
                    Zapisz typ zajęć
                  </button>
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => setDraft(null)}
                    disabled={savingEventType}
                  >
                    Anuluj
                  </button>
                </div>
              </form>
            )}
            {message && <p className="form-note">{message}</p>}
          </section>
        </div>
        <aside className="public-profile-preview">
          <p className="eyebrow">Podgląd strony</p>
          <PublicTutorPage
            profile={{
              ...profile,
              eventTypes: eventTypes
                .filter((item) => item.active && item.isPublic)
                .map(
                  ({
                    id,
                    name,
                    description,
                    durationMinutes,
                    priceGrosz,
                    currency,
                    format,
                  }) => ({
                    id,
                    name,
                    description,
                    durationMinutes,
                    priceGrosz,
                    currency,
                    format,
                  }),
                ),
            }}
            preview
          />
        </aside>
      </div>
    </section>
  );
}
