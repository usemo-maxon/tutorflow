"use client";

import Link from "next/link";
import { resolveEntitlements } from "@/lib/entitlements";
import {
  entitledPublicProfile,
  publishedProfileOffers,
} from "@/lib/profile-entitlements";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  LoaderCircle,
  MonitorSmartphone,
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
import {
  normalizePublicSlug,
  profileCompletion,
  profileContentKey,
} from "@/lib/public-profile";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { PublicTutorPage } from "@/components/public-tutor-page";
import { ProfileContentEditor } from "@/components/profile-content-editor";
import {
  conversionPercent,
  type FunnelEvent,
  type TrafficSource,
} from "@/lib/public-booking-analytics";
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

function PublicPageInsights({
  slug,
  published,
  days,
  onDays,
  analytics,
}: {
  slug: string;
  published: boolean;
  days: 7 | 30 | 90;
  onDays: (days: 7 | 30 | 90) => void;
  analytics: {
    funnel: Record<FunnelEvent, number>;
    sources: Array<{ source: TrafficSource; bookings: number }>;
  } | null;
}) {
  const publicUrl =
    typeof window === "undefined"
      ? `/${slug}`
      : `${window.location.origin}/${slug}`;
  const copy = (url = publicUrl) => {
    if (!published) return;
    void navigator.clipboard?.writeText(url);
  };
  const labels: Record<FunnelEvent, string> = {
    profile_view: "Wyświetlenia",
    event_type_selected: "Wybrano typ",
    slot_selected: "Wybrano termin",
    booking_started: "Rozpoczęto zapis",
    booking_completed: "Rezerwacje",
  };
  const sourceLabel: Record<TrafficSource, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    google: "Google",
    direct: "Direct",
    other: "Other",
  };
  const count = analytics?.funnel.booking_completed ?? 0;
  return (
    <section className="settings-form public-insights">
      <div className="event-type-settings__heading">
        <div>
          <p className="eyebrow">Statystyki</p>
          <h2>Strona publiczna</h2>
          <p>Proste, pierwszostronne dane bez śledzenia osób.</p>
        </div>
        <select
          aria-label="Zakres statystyk"
          value={days}
          onChange={(event) =>
            onDays(Number(event.target.value) as 7 | 30 | 90)
          }
        >
          <option value={7}>7 dni</option>
          <option value={30}>30 dni</option>
          <option value={90}>90 dni</option>
        </select>
      </div>
      {!analytics || analytics.funnel.profile_view === 0 ? (
        <div className="public-insights__empty">
          <strong>Nie masz jeszcze danych.</strong>
          <span>
            {published
              ? "Udostępnij swoją stronę, aby zacząć zbierać statystyki."
              : "Włącz stronę i zapisz profil, aby udostępnić działający link."}
          </span>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => copy()}
            disabled={!published}
          >
            Kopiuj link
          </button>
        </div>
      ) : (
        <>
          <div className="public-insights__funnel">
            {(Object.keys(labels) as FunnelEvent[]).map((event) => (
              <div key={event}>
                <span>{labels[event]}</span>
                <strong>{analytics.funnel[event] ?? 0}</strong>
              </div>
            ))}
          </div>
          <p className="form-note">
            profil → rezerwacja:{" "}
            {conversionPercent(count, analytics.funnel.profile_view)}%
          </p>
          {analytics.sources.length > 0 && (
            <div className="public-insights__sources">
              <strong>Źródła rezerwacji</strong>
              {analytics.sources.map((item) => (
                <span key={item.source}>
                  {sourceLabel[item.source]} <b>{item.bookings}</b>
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <div className="public-share-links">
        <button
          type="button"
          className="button button--secondary"
          onClick={() => copy()}
          disabled={!published}
        >
          Kopiuj link
        </button>
        <small>
          {published
            ? "Dodaj ten link do bio na Instagramie, TikToku lub Facebooku."
            : "Link będzie dostępny po opublikowaniu i zapisaniu strony."}
        </small>
        {(["instagram", "tiktok", "facebook"] as const).map((source) => (
          <button
            type="button"
            className="button button--quiet"
            key={source}
            onClick={() =>
              copy(`${publicUrl}?utm_source=${source}&utm_medium=social`)
            }
            disabled={!published}
          >
            Kopiuj: {source}
          </button>
        ))}
      </div>
    </section>
  );
}

export function PublicProfileSettings() {
  const teacher = useSessionTeacher();
  const entitlements = resolveEntitlements(teacher.subscription);
  const [profile, setProfile] = useState<TutorPublicProfile | null>(null);
  const [savedProfile, setSavedProfile] = useState<TutorPublicProfile | null>(
    null,
  );
  const [eventTypes, setEventTypes] = useState<BookingEventType[]>([]);
  const [availabilitySettings, setAvailabilitySettings] =
    useState<BookingAvailabilitySettings>(DEFAULT_BOOKING_AVAILABILITY);
  const [draft, setDraft] = useState<EventTypeDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingEventType, setSavingEventType] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [message, setMessage] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [mobilePreview, setMobilePreview] = useState(false);
  const mutationInFlight = useRef(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const loaded = useRef(false);
  const [analyticsDays, setAnalyticsDays] = useState<7 | 30 | 90>(30);
  const [analytics, setAnalytics] = useState<{
    funnel: Record<FunnelEvent, number>;
    sources: Array<{ source: TrafficSource; bookings: number }>;
  } | null>(null);

  useEffect(() => {
    let active = true;
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
        if (!active) return;
        if (
          !profileResult.response.ok ||
          !eventTypesResult.response.ok ||
          !availabilityResult.response.ok
        )
          throw new Error("LOAD_FAILED");
        const loadedProfile = profileResult.data as TutorPublicProfile;
        setProfile(loadedProfile);
        setSavedProfile(loadedProfile);
        setEventTypes(eventTypesResult.data as BookingEventType[]);
        setAvailabilitySettings({
          ...DEFAULT_BOOKING_AVAILABILITY,
          ...(availabilityResult.data as BookingAvailabilitySettings),
        });
        loaded.current = true;
      })
      .catch(() => {
        if (active) {
          setLoadError(true);
          setMessage("Nie udało się pobrać ustawień.");
        }
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  useEffect(() => {
    void fetch(`/api/public-profile/analytics?days=${analyticsDays}`, {
      cache: "no-store",
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => setAnalytics(data))
      .catch(() => setAnalytics(null));
  }, [analyticsDays]);

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

  const dirty = Boolean(
    profile &&
    savedProfile &&
    profileContentKey(profile) !== profileContentKey(savedProfile),
  );
  useUnsavedChanges(dirty);

  async function saveProfile(silent = false) {
    if (!profile || mutationInFlight.current || teacher.subscription.readOnly)
      return;
    mutationInFlight.current = true;
    const submittedProfile = profile;
    setSaving(true);
    setSaveState("saving");
    if (!silent) setMessage("");
    try {
      const response = await fetch("/api/public-profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Nie udało się zapisać.");
      }
      const saved = data as TutorPublicProfile;
      setProfile((current) =>
        current &&
        profileContentKey(current) === profileContentKey(submittedProfile)
          ? saved
          : current,
      );
      setSavedProfile(saved);
      setSaveState("saved");
      if (!silent) setMessage("Wersja robocza została zapisana.");
    } catch (error) {
      setSaveState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać. Twoje zmiany pozostały w edytorze.",
      );
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  }

  async function publishProfile() {
    if (!profile || mutationInFlight.current || teacher.subscription.readOnly)
      return;
    mutationInFlight.current = true;
    setPublishing(true);
    setSaving(true);
    setSaveState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/public-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Nie udało się opublikować profilu.");
      setProfile(data as TutorPublicProfile);
      setSavedProfile(data as TutorPublicProfile);
      setSaveState("saved");
      setMessage("Profil został opublikowany. Link pokazuje najnowszą wersję.");
    } catch (error) {
      setSaveState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się opublikować profilu.",
      );
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
      setPublishing(false);
    }
  }

  async function unpublishProfile() {
    if (!profile || mutationInFlight.current || teacher.subscription.readOnly)
      return;
    mutationInFlight.current = true;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/public-profile", { method: "DELETE" });
      if (!response.ok) throw new Error("Nie udało się wyłączyć profilu.");
      setProfile((current) =>
        current
          ? { ...current, enabled: false, publishedSlug: undefined }
          : current,
      );
      setSavedProfile((current) =>
        current
          ? { ...current, enabled: false, publishedSlug: undefined }
          : current,
      );
      setMessage(
        "Profil publiczny został wyłączony. Wersja robocza pozostała zapisana.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się wyłączyć profilu.",
      );
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  }

  useEffect(() => {
    if (
      !loaded.current ||
      !dirty ||
      saving ||
      saveState === "error" ||
      teacher.subscription.readOnly
    )
      return;
    const timer = window.setTimeout(() => void saveProfile(true), 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profile,
    savedProfile,
    dirty,
    saving,
    saveState,
    teacher.subscription.readOnly,
  ]);

  async function photo(file?: File) {
    if (!file) return;
    try {
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
    } catch {
      setMessage("Nie udało się przesłać zdjęcia. Spróbuj ponownie.");
    }
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
        {loadError ? (
          <>
            <p role="alert">Nie udało się pobrać ustawień.</p>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setLoadError(false);
                setLoadAttempt((value) => value + 1);
              }}
            >
              Spróbuj ponownie
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" /> Ładowanie strony publicznej…
          </>
        )}
      </section>
    );
  const publicHref = savedProfile?.publishedSlug
    ? `/${savedProfile.publishedSlug}`
    : undefined;
  const isPublished = Boolean(savedProfile?.enabled);
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
      <div
        className={`public-settings-layout${mobilePreview ? " is-previewing" : ""}`}
      >
        <div className="public-settings-stack">
          <section className="profile-studio">
            <div className="profile-studio-toolbar">
              <div
                className="profile-completion"
                style={
                  {
                    "--completion": `${profileCompletion(profile, eventTypes.length > 0)}%`,
                  } as React.CSSProperties
                }
              >
                <strong>
                  {profileCompletion(profile, eventTypes.length > 0)}%
                </strong>
                <span>gotowości profilu</span>
              </div>
              <div className="profile-save-state" aria-live="polite">
                {saveState === "saving" && (
                  <>
                    <LoaderCircle size={15} className="spin" />
                    Zapisywanie…
                  </>
                )}
                {saveState === "saved" &&
                  (dirty ? "Oczekiwanie na zapis…" : "Wersja robocza zapisana")}
                {saveState === "error" && "Nie udało się zapisać"}
              </div>
              <button
                type="button"
                className="button button--quiet profile-mobile-preview"
                onClick={() => setMobilePreview((value) => !value)}
              >
                <MonitorSmartphone size={16} />
                {mobilePreview ? "Wróć do edycji" : "Podgląd"}
              </button>
            </div>
            {saveState === "error" && (
              <button
                type="button"
                className="button button--secondary"
                disabled={saving || teacher.subscription.readOnly}
                onClick={() => void saveProfile()}
              >
                Ponów zapis
              </button>
            )}
            <div className="profile-publish-bar">
              <div>
                <span
                  className={`profile-status-dot${isPublished ? " is-live" : ""}`}
                />
                <strong>
                  {isPublished
                    ? "Profil jest publiczny"
                    : "Profil jest prywatny"}
                </strong>
                <small>
                  {isPublished
                    ? "Zmiany trafiają na stronę dopiero po ponownym opublikowaniu."
                    : "Automatyczny zapis nie publikuje danych."}
                </small>
              </div>
              <div className="public-settings-actions">
                {isPublished && (
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => void unpublishProfile()}
                    disabled={saving || teacher.subscription.readOnly}
                  >
                    Wyłącz
                  </button>
                )}
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void publishProfile()}
                  disabled={saving || teacher.subscription.readOnly}
                >
                  {saving && <LoaderCircle size={16} className="spin" />}
                  {isPublished ? "Opublikuj zmiany" : "Opublikuj profil"}
                </button>
              </div>
            </div>
            <fieldset
              className="profile-editor-fieldset"
              disabled={publishing || teacher.subscription.readOnly}
            >
              <div className="profile-studio-basics">
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
                  <small>
                    Po zmianie stare opublikowane linki przekierują na nowy
                    adres.
                  </small>
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
                <div className="form-row">
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
                      <option value="online,offline">
                        Online i stacjonarnie
                      </option>
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
                </div>
                <label className="field">
                  <span>Publiczne linki</span>
                  <textarea
                    rows={2}
                    value={profile.contactLinks.join("\n")}
                    onChange={(event) =>
                      update("contactLinks", split(event.target.value))
                    }
                    disabled={teacher.subscription.readOnly}
                    placeholder="https://linkedin.com/in/…"
                  />
                  <small>
                    E-mail i telefon konta nigdy nie są dodawane automatycznie.
                  </small>
                </label>
              </div>
              <ProfileContentEditor
                profile={profile}
                entitlements={entitlements}
                disabled={teacher.subscription.readOnly}
                onChange={setProfile}
                onMessage={setMessage}
              />
            </fieldset>
            {message && (
              <p className="profile-studio-message" role="status">
                {message}
              </p>
            )}
            {isPublished && publicHref && (
              <Link
                className="button button--secondary"
                href={publicHref}
                target="_blank"
              >
                <ExternalLink size={16} />
                Otwórz opublikowany profil
              </Link>
            )}
          </section>
          <PublicPageInsights
            slug={savedProfile?.publishedSlug ?? profile.slug}
            published={isPublished}
            days={analyticsDays}
            onDays={setAnalyticsDays}
            analytics={analytics}
          />
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
                onClick={() =>
                  setDraft({
                    ...newDraft(),
                    isPublic:
                      eventTypes.filter((item) => item.active && item.isPublic)
                        .length <
                      (entitlements.maxPublishedLessonOffers ?? 500),
                  })
                }
                disabled={teacher.subscription.readOnly || Boolean(draft)}
              >
                <Plus size={16} />
                Dodaj
              </button>
            </div>
            <p className="profile-editor-help">
              {entitlements.maxPublishedLessonOffers === null
                ? "Premium: bez limitu planowego publicznych ofert."
                : `Free: maksymalnie ${entitlements.maxPublishedLessonOffers} publiczne oferty. Nadmiarowe oferty są zachowane, ale nie są dostępne do rezerwacji.`}
            </p>
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
                      {publishedProfileOffers(eventTypes, entitlements).some(
                        (item) => item.id === eventType.id,
                      )
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
          <button
            type="button"
            className="button button--secondary profile-mobile-preview"
            onClick={() => setMobilePreview(false)}
          >
            Wróć do edycji
          </button>
          <p className="eyebrow">Podgląd strony</p>
          <PublicTutorPage
            profile={{
              ...entitledPublicProfile(profile, entitlements),
              eventTypes: publishedProfileOffers(eventTypes, entitlements).map(
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
