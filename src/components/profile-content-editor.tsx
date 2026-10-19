"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import type { Entitlements } from "@/lib/entitlements";
import {
  ArrowDown,
  ArrowUp,
  FileBadge2,
  GripVertical,
  Plus,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  DEFAULT_PROFILE_SECTIONS,
  normalizeProfileAccentColor,
  youtubeVideoId,
  type ProfileCertificate,
  type ProfileFaq,
  type ProfileTimelineEntry,
  type TutorPublicProfile,
} from "@/lib/public-profile";
import { TagInput } from "@/components/tag-input";

function moved<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = [...items];
  const target = index + direction;
  if (target >= 0 && target < next.length)
    [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function ItemOrder({
  label,
  index,
  count,
  disabled,
  onMove,
}: {
  label: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="profile-repeat-actions">
      <button
        type="button"
        className="icon-button"
        disabled={disabled || index === 0}
        aria-label={`Przesuń ${label} wyżej`}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={disabled || index === count - 1}
        aria-label={`Przesuń ${label} niżej`}
        onClick={() => onMove(1)}
      >
        <ArrowDown size={16} />
      </button>
    </div>
  );
}

async function validSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (file.type === "application/pdf")
    return String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
  if (file.type === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === "image/png")
    return bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (file.type === "image/webp")
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  if (file.type === "video/mp4")
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if (file.type === "video/webm")
    return bytes.slice(0, 4).join(",") === "26,69,223,163";
  return false;
}

export function ProfileContentEditor({
  profile,
  disabled,
  entitlements,
  onChange,
  onMessage,
}: {
  profile: TutorPublicProfile;
  disabled: boolean;
  entitlements: Entitlements;
  onChange: Dispatch<SetStateAction<TutorPublicProfile | null>>;
  onMessage: (message: string) => void;
}) {
  const [uploading, setUploading] = useState<string>();
  const update = <K extends keyof TutorPublicProfile>(
    key: K,
    value: TutorPublicProfile[K],
  ) =>
    onChange((current) => (current ? { ...current, [key]: value } : current));
  const sections = profile.sections ?? DEFAULT_PROFILE_SECTIONS;

  async function uploadMedia(
    file: File,
    kind: "video" | "certificate" | "poster",
  ) {
    if (!(await validSignature(file)))
      throw new Error("Zawartość pliku nie odpowiada jego formatowi.");
    setUploading(kind);
    try {
      const response = await fetch("/api/public-profile/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          name: file.name,
          type: file.type,
          size: file.size,
        }),
      });
      const prepared = (await response.json()) as {
        path?: string;
        token?: string;
        message?: string;
      };
      if (!response.ok || !prepared.path || !prepared.token)
        throw new Error(
          prepared.message || "Nie udało się przygotować przesyłania.",
        );
      const supabase = await createSupabaseBrowserClient();
      const { error } = await supabase.storage
        .from("tutor-profile-media")
        .uploadToSignedUrl(prepared.path, prepared.token, file, {
          contentType: file.type,
        });
      if (error) throw new Error("Przesyłanie pliku nie powiodło się.");
      const signed = await supabase.storage
        .from("tutor-profile-media")
        .createSignedUrl(prepared.path, 3600);
      return { path: prepared.path, url: signed.data?.signedUrl };
    } finally {
      setUploading(undefined);
    }
  }

  const moveSection = (index: number, direction: -1 | 1) => {
    const next = [...sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    update("sections", next);
  };

  return (
    <div className="profile-studio-fields">
      <details open className="profile-editor-group">
        <summary>
          <span className="profile-editor-step">01</span>
          <span>
            <strong>Pierwsze wrażenie</strong>
            <small>Nazwa, obietnica i najważniejsze informacje.</small>
          </span>
        </summary>
        <div className="profile-editor-body">
          <label className="field">
            <span>Publiczna nazwa</span>
            <input
              value={profile.publicName}
              maxLength={120}
              onChange={(event) => update("publicName", event.target.value)}
              disabled={disabled}
            />
          </label>
          <label className="field">
            <span>Nagłówek</span>
            <input
              value={profile.headline ?? ""}
              maxLength={160}
              onChange={(event) => update("headline", event.target.value)}
              disabled={disabled}
              placeholder="Angielski bez stresu — lekcje dopasowane do Ciebie"
            />
            <small>Jedno zdanie, które mówi komu i w czym pomagasz.</small>
          </label>
          <label className="field">
            <span>Krótkie wprowadzenie</span>
            <textarea
              rows={3}
              value={profile.shortIntro ?? ""}
              maxLength={260}
              onChange={(event) => update("shortIntro", event.target.value)}
              disabled={disabled}
              placeholder="Pomagam dorosłym mówić swobodniej i przygotować się do ważnych rozmów."
            />
          </label>
          <label className="field">
            <span>O mnie</span>
            <textarea
              rows={6}
              value={profile.about ?? ""}
              maxLength={3000}
              onChange={(event) => update("about", event.target.value)}
              disabled={disabled}
            />
          </label>
          <div className="form-row">
            <label className="field">
              <span>Przedmioty</span>
              <TagInput
                ariaLabel="Dodaj przedmiot"
                maxItems={12}
                maxLength={100}
                value={profile.subjects}
                onChange={(value) => update("subjects", value)}
                disabled={disabled}
                placeholder="Angielski, język biznesowy"
              />
            </label>
            <label className="field">
              <span>Specjalizacje</span>
              <TagInput
                ariaLabel="Dodaj specjalizację"
                maxItems={24}
                maxLength={100}
                value={profile.specializations ?? []}
                onChange={(value) => update("specializations", value)}
                disabled={disabled}
                placeholder="Matura, konwersacje, Cambridge"
              />
            </label>
          </div>
          <div className="form-row">
            <label className="field">
              <span>Poziomy</span>
              <TagInput
                ariaLabel="Dodaj poziom"
                maxItems={12}
                maxLength={100}
                value={profile.levels}
                onChange={(value) => update("levels", value)}
                disabled={disabled}
                placeholder="A2, B1, B2, C1"
              />
            </label>
            <label className="field">
              <span>Dla kogo</span>
              <TagInput
                ariaLabel="Dodaj grupę odbiorców"
                maxItems={12}
                maxLength={100}
                value={profile.audiences ?? []}
                onChange={(value) => update("audiences", value)}
                disabled={disabled}
                placeholder="Dorośli, licealiści"
              />
            </label>
          </div>
          <label className="field">
            <span>Języki, którymi się posługujesz</span>
            <TagInput
              ariaLabel="Dodaj język"
              maxItems={12}
              maxLength={100}
              value={profile.languages ?? []}
              onChange={(value) => update("languages", value)}
              disabled={disabled}
              placeholder="Polski, angielski"
            />
          </label>
          <div className="field">
            <span>Wyróżniki</span>
            <TagInput
              value={profile.highlights ?? []}
              onChange={(highlights) => update("highlights", highlights)}
              disabled={disabled}
              maxItems={6}
              placeholder="Wpisz wyróżnik i naciśnij Enter"
              ariaLabel="Dodaj wyróżnik"
            />
            <small>
              Rozdzielaj wyróżniki przecinkiem lub klawiszem Enter. Maksymalnie
              6. Pokazuj tylko informacje, które możesz rzetelnie potwierdzić.
            </small>
          </div>
        </div>
      </details>

      <details className="profile-editor-group">
        <summary>
          <span className="profile-editor-step">
            <Video size={17} />
          </span>
          <span>
            <strong>Film powitalny</strong>
            <small>Przedstaw się w krótkim filmie.</small>
          </span>
        </summary>
        <div className="profile-editor-body">
          <p className="profile-editor-help">
            Opowiedz przyszłym uczniom, kim jesteś, jak prowadzisz zajęcia i
            dlaczego warto uczyć się właśnie z Tobą.
          </p>
          <label className="field">
            <span>Link YouTube</span>
            <input
              placeholder="https://www.youtube.com/watch?v=…"
              disabled={disabled}
              defaultValue={
                profile.video?.source === "youtube"
                  ? `https://youtu.be/${profile.video.videoId}`
                  : ""
              }
              onBlur={(event) => {
                if (!event.target.value) return;
                const videoId = youtubeVideoId(event.target.value);
                if (!videoId)
                  return onMessage("Wklej prawidłowy link do filmu YouTube.");
                update("video", {
                  source: "youtube",
                  videoId,
                  title: profile.video?.title || "Poznajmy się",
                  description: profile.video?.description,
                });
              }}
            />
          </label>
          <div className="profile-upload-row">
            <span>lub prześlij MP4/WebM do 75 MB (Premium)</span>
            <label className="button button--secondary">
              <Upload size={16} />
              {uploading === "video" ? "Przesyłanie…" : "Wybierz film"}
              <input
                hidden
                type="file"
                accept="video/mp4,video/webm"
                disabled={
                  disabled ||
                  Boolean(uploading) ||
                  !entitlements.hostedIntroductionVideo
                }
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void uploadMedia(file, "video")
                    .then((asset) =>
                      update("video", {
                        source: "upload",
                        storagePath: asset.path,
                        url: asset.url,
                        title: profile.video?.title || "Poznajmy się",
                        description: profile.video?.description,
                      }),
                    )
                    .catch((error: Error) => onMessage(error.message));
                }}
              />
            </label>
          </div>
          {profile.video && (
            <>
              <label className="field">
                <span>Tytuł filmu</span>
                <input
                  value={profile.video.title}
                  onChange={(event) =>
                    update("video", {
                      ...profile.video!,
                      title: event.target.value,
                    })
                  }
                  disabled={disabled}
                />
              </label>
              <label className="field">
                <span>Krótki opis</span>
                <textarea
                  rows={2}
                  value={profile.video.description ?? ""}
                  onChange={(event) =>
                    update("video", {
                      ...profile.video!,
                      description: event.target.value,
                    })
                  }
                  disabled={disabled}
                />
              </label>
              <button
                type="button"
                className="button button--quiet danger-text"
                onClick={() => update("video", undefined)}
                disabled={disabled}
              >
                <Trash2 size={16} />
                Usuń film z profilu
              </button>
            </>
          )}
        </div>
      </details>

      <details className="profile-editor-group">
        <summary>
          <span className="profile-editor-step">
            <FileBadge2 size={17} />
          </span>
          <span>
            <strong>Kwalifikacje</strong>
            <small>Certyfikaty, dyplomy i szkolenia.</small>
          </span>
        </summary>
        <div className="profile-editor-body">
          <p className="profile-editor-help">
            Przed publikacją usuń z dokumentów PESEL, adres i inne zbędne dane.
            Dodanie pliku nie oznacza weryfikacji przez Easy4Tutor.
          </p>
          <p className="profile-editor-help">
            Limit publicznych kwalifikacji:{" "}
            {entitlements.maxPublishedCertificates}. Nadmiarowe dokumenty
            pozostają zapisane; po zmianie planu widoczne są pierwsze pozycje
            według kolejności.
          </p>
          {(profile.certificates ?? []).map((certificate, index) => (
            <div className="profile-repeat-card" key={certificate.id}>
              <label className="field">
                <span>Nazwa</span>
                <input
                  value={certificate.title}
                  onChange={(event) => {
                    const next = [...(profile.certificates ?? [])];
                    next[index] = { ...certificate, title: event.target.value };
                    update("certificates", next);
                  }}
                  disabled={disabled}
                />
              </label>
              <label className="field">
                <span>Instytucja</span>
                <input
                  value={certificate.issuer}
                  onChange={(event) => {
                    const next = [...(profile.certificates ?? [])];
                    next[index] = {
                      ...certificate,
                      issuer: event.target.value,
                    };
                    update("certificates", next);
                  }}
                  disabled={disabled}
                />
              </label>
              <div className="form-row">
                <label className="field">
                  <span>Data wydania</span>
                  <input
                    type="date"
                    value={certificate.issuedAt ?? ""}
                    onChange={(event) => {
                      const next = [...(profile.certificates ?? [])];
                      next[index] = {
                        ...certificate,
                        issuedAt: event.target.value,
                      };
                      update("certificates", next);
                    }}
                    disabled={disabled}
                  />
                </label>
                <label className="field">
                  <span>Link weryfikacyjny</span>
                  <input
                    type="url"
                    value={certificate.verificationUrl ?? ""}
                    onChange={(event) => {
                      const next = [...(profile.certificates ?? [])];
                      next[index] = {
                        ...certificate,
                        verificationUrl: event.target.value,
                      };
                      update("certificates", next);
                    }}
                    disabled={disabled}
                  />
                </label>
              </div>
              <div className="profile-repeat-actions">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={certificate.visible}
                    disabled={
                      disabled ||
                      (!certificate.visible &&
                        (profile.certificates ?? []).filter(
                          (item) => item.visible,
                        ).length >= entitlements.maxPublishedCertificates)
                    }
                    onChange={(event) => {
                      const next = [...(profile.certificates ?? [])];
                      next[index] = {
                        ...certificate,
                        visible: event.target.checked,
                      };
                      update("certificates", next);
                    }}
                  />
                  Pokaż publicznie
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Usuń kwalifikację"
                  onClick={() =>
                    update(
                      "certificates",
                      (profile.certificates ?? []).filter(
                        (item) => item.id !== certificate.id,
                      ),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <label className="field">
                <span>Ważny do (opcjonalnie)</span>
                <input
                  type="date"
                  value={certificate.expiresAt ?? ""}
                  onChange={(event) => {
                    const next = [...(profile.certificates ?? [])];
                    next[index] = {
                      ...certificate,
                      expiresAt: event.target.value,
                    };
                    update("certificates", next);
                  }}
                  disabled={disabled}
                />
              </label>
              <label className="field">
                <span>Opis kwalifikacji</span>
                <textarea
                  rows={2}
                  maxLength={600}
                  value={certificate.description ?? ""}
                  onChange={(event) => {
                    const next = [...(profile.certificates ?? [])];
                    next[index] = {
                      ...certificate,
                      description: event.target.value,
                    };
                    update("certificates", next);
                  }}
                  disabled={disabled}
                />
              </label>
              {certificate.fileUrl && (
                <a
                  href={certificate.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Podgląd dokumentu
                </a>
              )}
              <ItemOrder
                label={certificate.title || "kwalifikację"}
                index={index}
                count={profile.certificates?.length ?? 0}
                disabled={disabled}
                onMove={(direction) =>
                  update(
                    "certificates",
                    moved(profile.certificates ?? [], index, direction),
                  )
                }
              />
            </div>
          ))}
          <label className="button button--secondary profile-add-media">
            <Plus size={16} />
            {uploading === "certificate" ? "Przesyłanie…" : "Dodaj dokument"}
            <input
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={disabled || Boolean(uploading)}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void uploadMedia(file, "certificate")
                  .then((asset) => {
                    const item: ProfileCertificate = {
                      id: crypto.randomUUID(),
                      title: file.name.replace(/\.[^.]+$/, ""),
                      issuer: "",
                      storagePath: asset.path,
                      fileUrl: asset.url,
                      fileType:
                        file.type === "application/pdf" ? "pdf" : "image",
                      visible: true,
                    };
                    onChange((current) =>
                      current
                        ? {
                            ...current,
                            certificates: [
                              ...(current.certificates ?? []),
                              {
                                ...item,
                                visible:
                                  (current.certificates ?? []).filter(
                                    (entry) => entry.visible,
                                  ).length <
                                  entitlements.maxPublishedCertificates,
                              },
                            ],
                          }
                        : current,
                    );
                  })
                  .catch((error: Error) => onMessage(error.message));
              }}
            />
          </label>
        </div>
      </details>

      <details className="profile-editor-group">
        <summary>
          <span className="profile-editor-step">02</span>
          <span>
            <strong>Sposób nauczania</strong>
            <small>Pokaż, jak wygląda współpraca.</small>
          </span>
        </summary>
        <div className="profile-editor-body">
          <label className="field">
            <span>Filozofia nauczania</span>
            <textarea
              rows={4}
              value={profile.teachingApproach?.philosophy ?? ""}
              onChange={(event) =>
                update("teachingApproach", {
                  ...(profile.teachingApproach ?? { highlights: [] }),
                  philosophy: event.target.value,
                })
              }
              disabled={disabled}
            />
          </label>
          <label className="field">
            <span>Jak wygląda lekcja</span>
            <textarea
              rows={3}
              value={profile.teachingApproach?.lessonStructure ?? ""}
              onChange={(event) =>
                update("teachingApproach", {
                  ...(profile.teachingApproach ?? { highlights: [] }),
                  lessonStructure: event.target.value,
                })
              }
              disabled={disabled}
            />
          </label>
          <label className="field">
            <span>Metody i materiały</span>
            <textarea
              rows={3}
              value={profile.teachingApproach?.materials ?? ""}
              onChange={(event) =>
                update("teachingApproach", {
                  ...(profile.teachingApproach ?? { highlights: [] }),
                  materials: event.target.value,
                })
              }
              disabled={disabled}
            />
          </label>
          {(
            [
              ["homework", "Praca własna między lekcjami"],
              ["personalization", "Dopasowanie do ucznia"],
              ["outcomes", "Cele i efekty nauki"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={profile.teachingApproach?.[key] ?? ""}
                onChange={(event) =>
                  update("teachingApproach", {
                    ...(profile.teachingApproach ?? { highlights: [] }),
                    [key]: event.target.value,
                  })
                }
                disabled={disabled}
              />
            </label>
          ))}
          <label className="field">
            <span>Najważniejsze elementy</span>
            <TagInput
              ariaLabel="Dodaj element sposobu nauczania"
              maxItems={8}
              maxLength={80}
              value={profile.teachingApproach?.highlights ?? []}
              onChange={(value) =>
                update("teachingApproach", {
                  ...(profile.teachingApproach ?? {}),
                  highlights: value,
                })
              }
              disabled={disabled}
              placeholder="Plan dopasowany do celu, Praktyczne ćwiczenia, Regularny feedback"
            />
          </label>
        </div>
      </details>

      <details className="profile-editor-group">
        <summary>
          <span className="profile-editor-step">03</span>
          <span>
            <strong>Doświadczenie i edukacja</strong>
            <small>Uporządkowana oś zawodowa.</small>
          </span>
        </summary>
        <div className="profile-editor-body">
          {(profile.timeline ?? []).map((entry, index) => {
            const change = (patch: Partial<ProfileTimelineEntry>) => {
              const next = [...(profile.timeline ?? [])];
              next[index] = { ...entry, ...patch };
              update("timeline", next);
            };
            return (
              <div className="profile-repeat-card" key={entry.id}>
                <div className="form-row">
                  <label className="field">
                    <span>Typ</span>
                    <select
                      value={entry.kind}
                      disabled={disabled}
                      onChange={(event) =>
                        change({
                          kind: event.target
                            .value as ProfileTimelineEntry["kind"],
                        })
                      }
                    >
                      <option value="experience">Doświadczenie</option>
                      <option value="education">Edukacja</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Rola / kierunek / stopień</span>
                    <input
                      maxLength={140}
                      value={entry.title}
                      disabled={disabled}
                      onChange={(event) =>
                        change({ title: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Instytucja</span>
                  <input
                    maxLength={140}
                    value={entry.institution}
                    disabled={disabled}
                    onChange={(event) =>
                      change({ institution: event.target.value })
                    }
                  />
                </label>
                <div className="form-row">
                  <label className="field">
                    <span>Rok rozpoczęcia</span>
                    <input
                      type="number"
                      min={1900}
                      max={2200}
                      value={entry.startYear ?? ""}
                      disabled={disabled}
                      onChange={(event) =>
                        change({
                          startYear: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Rok zakończenia</span>
                    <input
                      type="number"
                      min={entry.startYear ?? 1900}
                      max={2200}
                      value={entry.endYear ?? ""}
                      disabled={disabled || entry.current}
                      onChange={(event) =>
                        change({
                          endYear: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        })
                      }
                    />
                  </label>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={Boolean(entry.current)}
                    disabled={disabled}
                    onChange={(event) =>
                      change({ current: event.target.checked })
                    }
                  />
                  Nadal trwa
                </label>
                <label className="field">
                  <span>Opis</span>
                  <textarea
                    rows={3}
                    maxLength={800}
                    value={entry.description ?? ""}
                    disabled={disabled}
                    onChange={(event) =>
                      change({ description: event.target.value })
                    }
                  />
                </label>
                <div className="profile-repeat-actions">
                  <ItemOrder
                    label={entry.title || "wpis"}
                    index={index}
                    count={profile.timeline?.length ?? 0}
                    disabled={disabled}
                    onMove={(direction) =>
                      update(
                        "timeline",
                        moved(profile.timeline ?? [], index, direction),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="icon-button"
                    disabled={disabled}
                    onClick={() =>
                      update(
                        "timeline",
                        (profile.timeline ?? []).filter(
                          (item) => item.id !== entry.id,
                        ),
                      )
                    }
                    aria-label="Usuń wpis"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="button button--secondary"
            disabled={disabled}
            onClick={() =>
              update("timeline", [
                ...(profile.timeline ?? []),
                {
                  id: crypto.randomUUID(),
                  kind: "experience",
                  institution: "",
                  title: "",
                  startYear: new Date().getFullYear(),
                  current: true,
                },
              ])
            }
          >
            <Plus size={16} />
            Dodaj wpis
          </button>
        </div>
      </details>

      <details className="profile-editor-group">
        <summary>
          <span className="profile-editor-step">?</span>
          <span>
            <strong>FAQ</strong>
            <small>Odpowiedz przed pierwszą wiadomością.</small>
          </span>
        </summary>
        <div className="profile-editor-body">
          {(profile.faq ?? []).map((item, index) => (
            <div className="profile-repeat-card" key={item.id}>
              <label className="field">
                <span>Pytanie</span>
                <input
                  maxLength={180}
                  value={item.question}
                  onChange={(event) => {
                    const next = [...(profile.faq ?? [])];
                    next[index] = { ...item, question: event.target.value };
                    update("faq", next);
                  }}
                />
              </label>
              <label className="field">
                <span>Odpowiedź</span>
                <textarea
                  rows={3}
                  maxLength={1200}
                  value={item.answer}
                  onChange={(event) => {
                    const next = [...(profile.faq ?? [])];
                    next[index] = { ...item, answer: event.target.value };
                    update("faq", next);
                  }}
                />
              </label>
              <div className="profile-repeat-actions">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={item.visible}
                    onChange={(event) => {
                      const next = [...(profile.faq ?? [])];
                      next[index] = { ...item, visible: event.target.checked };
                      update("faq", next);
                    }}
                  />
                  Pokaż
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Usuń pytanie"
                  onClick={() =>
                    update(
                      "faq",
                      (profile.faq ?? []).filter(
                        (entry) => entry.id !== item.id,
                      ),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <ItemOrder
                label={item.question || "pytanie"}
                index={index}
                count={profile.faq?.length ?? 0}
                disabled={disabled}
                onMove={(direction) =>
                  update("faq", moved(profile.faq ?? [], index, direction))
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="button button--secondary"
            disabled={disabled}
            onClick={() => {
              const item: ProfileFaq = {
                id: crypto.randomUUID(),
                question: "",
                answer: "",
                visible: true,
              };
              update("faq", [...(profile.faq ?? []), item]);
            }}
          >
            <Plus size={16} />
            Dodaj pytanie
          </button>
        </div>
      </details>

      <details className="profile-editor-group">
        <summary>
          <span className="profile-editor-step">
            <GripVertical size={17} />
          </span>
          <span>
            <strong>Wygląd i kolejność</strong>
            <small>Spójny motyw bez edycji kodu.</small>
          </span>
        </summary>
        <div className="profile-editor-body">
          {!entitlements.advancedProfilePersonalization && (
            <p className="profile-editor-help">
              Plan Free używa motywu Profesjonalnego. Zapisane ustawienia
              Premium pozostają zachowane.{" "}
              <Link href="/app/ustawienia/subskrypcja">Poznaj Premium</Link>
            </p>
          )}
          <fieldset
            className="profile-editor-fieldset"
            disabled={disabled || !entitlements.advancedProfilePersonalization}
          >
            <div className="profile-theme-grid">
              {(["minimal", "professional", "friendly", "modern"] as const).map(
                (theme) => (
                  <button
                    type="button"
                    key={theme}
                    className={`profile-theme-option${(profile.theme ?? "professional") === theme ? " is-selected" : ""}`}
                    onClick={() => update("theme", theme)}
                  >
                    <span className={`profile-theme-swatch theme-${theme}`} />
                    {
                      {
                        minimal: "Minimalny",
                        professional: "Profesjonalny",
                        friendly: "Przyjazny",
                        modern: "Nowoczesny",
                      }[theme]
                    }
                  </button>
                ),
              )}
            </div>
            <div className="profile-color-field">
              <span>Kolor profilu</span>
              <div className="profile-accent-row">
                {["#137d60", "#315c8c", "#a65358", "#7659a7"].map((color) => (
                  <button
                    type="button"
                    key={color}
                    className="profile-accent"
                    style={{ background: color }}
                    aria-label={`Wybierz kolor ${color}`}
                    aria-pressed={(profile.accentColor ?? "#137d60") === color}
                    onClick={() => update("accentColor", color)}
                    disabled={disabled}
                  />
                ))}
                <label className="profile-custom-color">
                  <input
                    type="color"
                    value={
                      normalizeProfileAccentColor(profile.accentColor) ??
                      "#137d60"
                    }
                    onChange={(event) =>
                      update("accentColor", event.target.value)
                    }
                    disabled={disabled}
                    aria-label="Wybierz własny kolor profilu"
                  />
                  <span>Własny</span>
                </label>
                <output>
                  {(profile.accentColor ?? "#137d60").toUpperCase()}
                </output>
              </div>
            </div>
            <div className="profile-section-list">
              {sections.map((section, index) => (
                <div key={section.id}>
                  <GripVertical size={16} />
                  <input
                    value={section.title}
                    aria-label={`Tytuł sekcji ${section.title}`}
                    onChange={(event) => {
                      const next = [...sections];
                      next[index] = { ...section, title: event.target.value };
                      update("sections", next);
                    }}
                  />
                  <label className="profile-visibility">
                    <input
                      type="checkbox"
                      checked={section.visible}
                      onChange={(event) => {
                        const next = [...sections];
                        next[index] = {
                          ...section,
                          visible: event.target.checked,
                        };
                        update("sections", next);
                      }}
                    />
                    Pokaż
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => moveSection(index, -1)}
                    disabled={index === 0}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => moveSection(index, 1)}
                    disabled={index === sections.length - 1}
                  >
                    <ArrowDown size={15} />
                  </button>
                </div>
              ))}
            </div>
          </fieldset>
        </div>
      </details>
    </div>
  );
}
