"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  BadgeCheck,
  BookCopy,
  BookOpenCheck,
  Clock3,
  Flag,
  FileX2,
  Heart,
  LibraryBig,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientApiError } from "@/lib/api-client";
import type {
  SharedTemplate,
  SharedTemplatesData,
} from "@/lib/shared-templates";
import { discoverSharedTemplates } from "@/lib/shared-templates";
import {
  reportReasonLabel,
  reportReasons,
  type TemplateReportReason,
} from "@/lib/community-quality";
import { useAppUi } from "../app-ui-context";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";

export function SharedTemplatesPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { showError, showToast } = useAppUi();
  const [data, setData] = useState<SharedTemplatesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [subject, setSubject] = useState(params.get("subject") ?? "");
  const [level, setLevel] = useState(params.get("level") ?? "");
  const [duration, setDuration] = useState(params.get("duration") ?? "");
  const [view, setView] = useState<
    "recommended" | "popular" | "newest" | "saved"
  >(
    (params.get("view") as "recommended" | "popular" | "newest" | "saved") ??
      "recommended",
  );
  const [sort, setSort] = useState<"popular" | "newest">(
    params.get("sort") === "newest" ? "newest" : "popular",
  );
  const [selected, setSelected] = useState<SharedTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);

  const query = useMemo(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("q", search.trim());
    if (subject) next.set("subject", subject);
    if (level) next.set("level", level);
    if (duration) next.set("duration", duration);
    if (view !== "recommended") next.set("view", view);
    if (sort !== "popular") next.set("sort", sort);
    return next.toString();
  }, [duration, level, search, sort, subject, view]);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoadError(false);
      const result = await api<SharedTemplatesData>(
        `/api/shared-templates${query ? `?${query}` : ""}`,
        { cache: "no-store", signal },
      );
      setData(result);
      return result;
    },
    [query],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      router.replace(`/app/materialy/biblioteka${query ? `?${query}` : ""}`, {
        scroll: false,
      });
      void refresh(controller.signal)
        .catch((error) => {
          if (!controller.signal.aborted) {
            setLoadError(true);
            showError(error);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, refresh, router, showError]);

  async function save(template: SharedTemplate) {
    setSaving(true);
    setSavedTemplateId(null);
    try {
      const result = await api<{ templateId: string }>(
        `/api/shared-templates/${template.id}/save`,
        { method: "POST" },
      );
      setSavedTemplateId(result.templateId);
      showToast({ message: "Szablon zapisano w Twojej prywatnej bibliotece." });
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  }

  async function favorite(template: SharedTemplate, nextFavorite: boolean) {
    try {
      await api(`/api/shared-templates/${template.id}/favorite`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite: nextFavorite }),
      });
      const refreshed = await refresh();
      setSelected(
        refreshed.templates.find((item) => item.id === template.id) ?? null,
      );
      showToast({
        message: nextFavorite
          ? "Szablon zapisano na później."
          : "Usunięto z zapisanych.",
      });
    } catch (error) {
      showError(error);
    }
  }

  if (loading && !data) return <PageLoading />;
  const filtered = Boolean(search || subject || level || duration);
  const displayed = discoverSharedTemplates(data?.templates ?? [], view, sort);
  return (
    <div className="shared-template-page page-enter">
      <header className="page-header shared-template-hero">
        <div>
          <Link className="template-back" href="/app/materialy">
            <ArrowLeft size={15} />
            Materiały
          </Link>
          <p className="eyebrow">Gotowe scenariusze do własnej pracy</p>
          <h1>Biblioteka szablonów</h1>
          <p className="page-intro">
            Wybierz kompletny plan, zobacz każdą część lekcji i zapisz
            niezależną kopię, którą możesz dowolnie edytować.
          </p>
        </div>
        <div className="shared-template-hero__seal" aria-hidden="true">
          <LibraryBig size={28} />
          <span>
            <strong>{data?.templates.length ?? 0}</strong>
            planów po filtrach
          </span>
        </div>
      </header>

      <section
        className="shared-template-library"
        aria-label="Wspólna biblioteka szablonów"
      >
        <div className="shared-template-toolbar">
          <label className="search-field shared-template-search">
            <Search size={18} />
            <span className="sr-only">Szukaj w bibliotece szablonów</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Szukaj tematu, celu lub aktywności..."
            />
          </label>
          <select
            aria-label="Przedmiot"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          >
            <option value="">Każdy przedmiot</option>
            {data?.subjects.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Poziom"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            <option value="">Każdy poziom</option>
            {data?.levels.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Maksymalny czas"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          >
            <option value="">Dowolny czas</option>
            <option value="45">Do 45 min</option>
            <option value="60">Do 60 min</option>
            <option value="90">Do 90 min</option>
          </select>
        </div>

        <div className="shared-template-discovery">
          <div
            className="shared-template-tabs"
            role="tablist"
            aria-label="Sposób odkrywania szablonów"
          >
            {(
              [
                ["recommended", "Polecane"],
                ["popular", "Popularne"],
                ["newest", "Najnowsze"],
                ["saved", "Zapisane"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={view === value}
                className={view === value ? "is-active" : undefined}
                onClick={() => setView(value)}
              >
                {value === "recommended" && <Sparkles size={15} />}
                {value === "popular" && <TrendingUp size={15} />}
                {value === "saved" && <Heart size={15} />}
                {label}
              </button>
            ))}
          </div>
          <label>
            <span className="sr-only">Sortowanie</span>
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as "popular" | "newest")
              }
            >
              <option value="popular">Najpopularniejsze</option>
              <option value="newest">Najnowsze</option>
            </select>
          </label>
        </div>

        {loadError ? (
          <EmptyState
            title="Nie udało się wczytać biblioteki"
            description="Sprawdź połączenie i spróbuj ponownie. Twoje prywatne szablony są bezpieczne."
            action={
              <button
                className="button button--secondary"
                onClick={() => {
                  setLoading(true);
                  void refresh()
                    .catch(showError)
                    .finally(() => setLoading(false));
                }}
              >
                Spróbuj ponownie
              </button>
            }
          />
        ) : displayed.length ? (
          <div className="shared-template-grid">
            {displayed.map((template) => (
              <SharedTemplateCard
                key={template.id}
                template={template}
                onOpen={() => {
                  setSavedTemplateId(null);
                  setSelected(template);
                }}
                onFavorite={() => void favorite(template, !template.isFavorite)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              filtered
                ? "Brak szablonów dla tych filtrów"
                : view === "saved"
                  ? "Nie masz jeszcze zapisanych szablonów"
                  : view === "popular"
                    ? "Popularne szablony dopiero się pojawią"
                    : view === "recommended"
                      ? "Brak polecanych szablonów"
                      : "Biblioteka jest jeszcze pusta"
            }
            description={
              filtered
                ? "Zmień poziom, czas lub wpisaną frazę, aby zobaczyć więcej planów."
                : view === "saved"
                  ? "Użyj opcji „Zapisz na później” na karcie lub w podglądzie."
                  : view === "popular"
                    ? "Popularne szablony pojawią się, gdy nauczyciele zaczną z nich korzystać."
                    : view === "recommended"
                      ? "Polecane przez Easy4Tutor pojawią się po ręcznej selekcji."
                      : "Zatwierdzone szablony pojawią się tutaj, gdy będą gotowe."
            }
            action={
              filtered ? (
                <button
                  className="button button--secondary"
                  onClick={() => {
                    setSearch("");
                    setSubject("");
                    setLevel("");
                    setDuration("");
                  }}
                >
                  Wyczyść filtry
                </button>
              ) : undefined
            }
          />
        )}
      </section>

      <SharedTemplatePreview
        template={selected}
        readOnly={Boolean(data?.readOnly)}
        saving={saving}
        savedTemplateId={savedTemplateId}
        onClose={() => setSelected(null)}
        onSave={save}
        onFavorite={(template, nextFavorite) =>
          favorite(template, nextFavorite)
        }
        onReported={() =>
          showToast({
            message: "Dziękujemy za zgłoszenie. Sprawdzimy ten szablon.",
          })
        }
      />
    </div>
  );
}

function SharedTemplateCard({
  template,
  onOpen,
  onFavorite,
}: {
  template: SharedTemplate;
  onOpen: () => void;
  onFavorite: () => void;
}) {
  return (
    <article className="shared-template-card">
      <button
        className="shared-template-card__open"
        onClick={onOpen}
        aria-label={`Podejrzyj: ${template.title}`}
      />
      <button
        className={`shared-template-favorite${template.isFavorite ? " is-active" : ""}`}
        onClick={onFavorite}
        aria-label={
          template.isFavorite ? "Usuń z zapisanych" : "Zapisz na później"
        }
        title={template.isFavorite ? "Usuń z zapisanych" : "Zapisz na później"}
      >
        <Heart size={17} fill={template.isFavorite ? "currentColor" : "none"} />
      </button>
      <span className="shared-template-card__spine" aria-hidden="true">
        {template.sections.slice(0, 5).map((section) => (
          <i key={section.id} />
        ))}
      </span>
      <span className="shared-template-card__content">
        <span className="shared-template-card__source">
          {template.isFeatured ? (
            <>
              <Sparkles size={15} /> Polecane przez Easy4Tutor
            </>
          ) : template.sourceKind === "official" ? (
            <>
              <BadgeCheck size={15} /> Oficjalny szablon Easy4Tutor
            </>
          ) : (
            <>
              <UserRound size={14} /> Od społeczności
            </>
          )}
        </span>
        <strong>{template.title}</strong>
        <small>{template.description}</small>
        <span className="shared-template-card__footer">
          <em>
            {template.subject} · {template.level}
          </em>
          <em>
            <Clock3 size={13} /> {template.estimatedDurationMinutes} min
          </em>
          {template.adoptionCount > 0 && (
            <em>
              <TrendingUp size={13} /> Zapisano: {template.adoptionCount} razy
            </em>
          )}
        </span>
      </span>
    </article>
  );
}

function SharedTemplatePreview({
  template,
  readOnly,
  saving,
  savedTemplateId,
  onClose,
  onSave,
  onFavorite,
  onReported,
}: {
  template: SharedTemplate | null;
  readOnly: boolean;
  saving: boolean;
  savedTemplateId: string | null;
  onClose: () => void;
  onSave: (template: SharedTemplate) => Promise<void>;
  onFavorite: (template: SharedTemplate, favorite: boolean) => Promise<void>;
  onReported: () => void;
}) {
  const { showError } = useAppUi();
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] =
    useState<TemplateReportReason>("copyright");
  const [reportExplanation, setReportExplanation] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  if (!template) return null;
  async function report() {
    setSubmittingReport(true);
    try {
      await api(`/api/shared-templates/${template!.id}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: reportReason,
          explanation: reportExplanation,
        }),
      });
      setReporting(false);
      setReportExplanation("");
      onReported();
    } catch (error) {
      showError(error);
    } finally {
      setSubmittingReport(false);
    }
  }
  return (
    <Dialog.Root open onOpenChange={(open) => !open && !saving && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content shared-template-preview">
          <header className="dialog-header shared-template-preview__header">
            <div>
              <span
                className={`shared-template-source shared-template-source--${template.sourceKind}`}
              >
                {template.sourceKind === "official" ? (
                  <BadgeCheck size={16} />
                ) : (
                  <UserRound size={15} />
                )}
                {template.sourceKind === "official"
                  ? "Oficjalny szablon Easy4Tutor"
                  : "Od społeczności"}
              </span>
              <Dialog.Title>{template.title}</Dialog.Title>
              <Dialog.Description>{template.description}</Dialog.Description>
              {template.isFeatured && (
                <span className="shared-template-recommended">
                  <Sparkles size={14} /> Polecane przez Easy4Tutor
                </span>
              )}
            </div>
            <Dialog.Close
              className="icon-button"
              aria-label="Zamknij"
              disabled={saving}
            >
              <X size={19} />
            </Dialog.Close>
          </header>

          <div className="shared-template-preview__scroll">
            <dl className="shared-template-facts">
              <div>
                <dt>Przedmiot</dt>
                <dd>{template.subject}</dd>
              </div>
              <div>
                <dt>Poziom</dt>
                <dd>{template.level}</dd>
              </div>
              <div>
                <dt>Czas</dt>
                <dd>{template.estimatedDurationMinutes} min</dd>
              </div>
              <div>
                <dt>Autor / źródło</dt>
                <dd>Autor: {template.authorName}</dd>
              </div>
            </dl>

            {template.adoptionCount > 0 && (
              <p className="shared-template-adoption">
                <TrendingUp size={16} /> Zapisano do biblioteki:{" "}
                {template.adoptionCount} razy
              </p>
            )}

            <section className="shared-template-objective">
              <span>
                <ShieldCheck size={18} /> Cel lekcji
              </span>
              <p>{template.objective}</p>
            </section>

            <section>
              <div className="shared-template-section-heading">
                <div>
                  <span className="eyebrow">
                    Otrzymasz dokładnie tę strukturę
                  </span>
                  <h3>Plan lekcji</h3>
                </div>
                <small>{template.sections.length} sekcje</small>
              </div>
              <ol className="shared-template-section-list">
                {template.sections.map((section) => (
                  <li key={section.id}>
                    <span>{section.position + 1}</span>
                    <div>
                      <strong>{section.title}</strong>
                      <p>{section.content}</p>
                    </div>
                    {section.estimatedMinutes && (
                      <small>{section.estimatedMinutes} min</small>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            <aside
              className={`shared-template-safety${template.excludedPrivateAttachments ? " shared-template-safety--notice" : ""}`}
            >
              <FileX2 size={20} />
              <div>
                <strong>
                  {template.excludedPrivateAttachments
                    ? "Prywatne załączniki zostały wykluczone"
                    : "Bez prywatnych plików"}
                </strong>
                <p>
                  Do Twojej biblioteki trafi tylko bezpieczna struktura i tekst
                  lekcji. Pliki, notatki nauczyciela i dane uczniów nie są
                  kopiowane.
                </p>
              </div>
            </aside>

            {reporting && (
              <section
                className="shared-template-report"
                aria-label="Zgłoś szablon"
              >
                <div>
                  <Flag size={18} />
                  <div>
                    <strong>Zgłoś szablon</strong>
                    <p>
                      Zgłoszenie trafi wyłącznie do administratorów Easy4Tutor.
                    </p>
                  </div>
                </div>
                <label className="field">
                  <span>Powód</span>
                  <select
                    value={reportReason}
                    onChange={(event) =>
                      setReportReason(
                        event.target.value as TemplateReportReason,
                      )
                    }
                  >
                    {reportReasons.map((reason) => (
                      <option key={reason} value={reason}>
                        {reportReasonLabel(reason)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>
                    Wyjaśnienie <small>opcjonalne</small>
                  </span>
                  <textarea
                    value={reportExplanation}
                    onChange={(event) =>
                      setReportExplanation(event.target.value)
                    }
                    maxLength={1000}
                    rows={3}
                    placeholder="Dodaj krótki kontekst dla moderatora"
                  />
                </label>
                <div className="shared-template-report__actions">
                  <button
                    className="button button--quiet"
                    disabled={submittingReport}
                    onClick={() => setReporting(false)}
                  >
                    Anuluj
                  </button>
                  <button
                    className="button button--secondary"
                    disabled={submittingReport}
                    onClick={() => void report()}
                  >
                    {submittingReport ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Flag size={16} />
                    )}{" "}
                    Wyślij zgłoszenie
                  </button>
                </div>
              </section>
            )}
          </div>

          <footer className="dialog-footer shared-template-preview__footer">
            <p>
              <BookCopy size={16} />
              Kopia będzie prywatna i niezależna od źródła.
            </p>
            <div className="shared-template-preview__secondary-actions">
              <button
                className={`button button--quiet${template.isFavorite ? " is-active" : ""}`}
                onClick={() => void onFavorite(template, !template.isFavorite)}
              >
                <Heart
                  size={17}
                  fill={template.isFavorite ? "currentColor" : "none"}
                />{" "}
                {template.isFavorite ? "Zapisano" : "Zapisz na później"}
              </button>
              <button
                className="button button--quiet"
                onClick={() => setReporting((value) => !value)}
              >
                <Flag size={16} /> Zgłoś szablon
              </button>
            </div>
            {savedTemplateId ? (
              <Link
                className="button button--primary"
                href="/app/materialy/szablony"
              >
                <BookOpenCheck size={17} /> Otwórz moje szablony
              </Link>
            ) : (
              <button
                className="button button--primary"
                disabled={readOnly || saving}
                title={
                  readOnly ? "Konto jest w trybie tylko do odczytu" : undefined
                }
                onClick={() => void onSave(template)}
              >
                {saving ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <BookCopy size={17} />
                )}
                {saving ? "Zapisywanie…" : "Zapisz do moich szablonów"}
              </button>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T | { code: string; message: string };
  if (!response.ok) throw new ClientApiError(response.status, body as never);
  return body as T;
}
