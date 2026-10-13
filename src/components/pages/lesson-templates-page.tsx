"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpenCheck,
  Clock3,
  Copy,
  FileText,
  GripVertical,
  Layers3,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { ClientApiError } from "@/lib/api-client";
import type {
  LessonTemplate,
  LessonTemplateInput,
  LessonTemplateSection,
  LessonTemplatesData,
} from "@/lib/lesson-templates";
import { useAppUi } from "../app-ui-context";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";

type EditorValue = LessonTemplate | "new" | null;

export function LessonTemplatesPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { showError, showToast } = useAppUi();
  const [data, setData] = useState<LessonTemplatesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [subject, setSubject] = useState(params.get("subject") ?? "");
  const [level, setLevel] = useState(params.get("level") ?? "");
  const [tag, setTag] = useState(params.get("tag") ?? "");
  const [archived, setArchived] = useState(params.get("view") === "archived");
  const [selected, setSelected] = useState<LessonTemplate | null>(null);
  const [editor, setEditor] = useState<EditorValue>(
    params.get("action") === "new" ? "new" : null,
  );
  const [archiveTarget, setArchiveTarget] = useState<LessonTemplate | null>(
    null,
  );
  const [pending, setPending] = useState(false);

  const query = useMemo(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("q", search.trim());
    if (subject) next.set("subject", subject);
    if (level) next.set("level", level);
    if (tag) next.set("tag", tag);
    if (archived) next.set("view", "archived");
    return next.toString();
  }, [archived, level, search, subject, tag]);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const result = await api<LessonTemplatesData>(
        `/api/lesson-templates${query ? `?${query}` : ""}`,
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
      router.replace(`/app/materialy/szablony${query ? `?${query}` : ""}`, {
        scroll: false,
      });
      void refresh(controller.signal)
        .catch((error) => {
          if (!controller.signal.aborted) showError(error);
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

  async function archiveTemplate() {
    if (!archiveTarget) return;
    setPending(true);
    try {
      await api(`/api/lesson-templates/${archiveTarget.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      setArchiveTarget(null);
      setSelected(null);
      await refresh();
      showToast({ message: "Szablon został zarchiwizowany." });
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  }
  async function duplicate(template: LessonTemplate) {
    setPending(true);
    try {
      const copy = await api<LessonTemplate>(
        `/api/lesson-templates/${template.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "duplicate" }),
        },
      );
      setSelected(null);
      await refresh();
      setEditor(copy);
      showToast({ message: "Utworzono niezależną kopię szablonu." });
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  }

  if (loading && !data) return <PageLoading />;
  if (!data) return null;
  const filtered = Boolean(search || subject || level || tag);
  return (
    <div className="template-page page-enter">
      <header className="page-header template-header">
        <div>
          <Link className="template-back" href="/app/materialy">
            <ArrowLeft size={15} />
            Materiały
          </Link>
          <p className="eyebrow">Plany do wielokrotnego użycia</p>
          <h1>Szablony lekcji</h1>
          <p className="page-intro">
            Układaj sprawdzone scenariusze i dodawaj je do przyszłych zajęć
            jednym ruchem.
          </p>
        </div>
        <button
          className="button button--primary"
          disabled={data.readOnly}
          onClick={() => setEditor("new")}
        >
          <Plus size={18} />
          Nowy szablon
        </button>
      </header>
      <section className="template-library" aria-label="Szablony lekcji">
        <div className="template-toolbar">
          <label className="search-field">
            <Search size={18} />
            <span className="sr-only">Szukaj szablonów</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Szukaj nazwy, poziomu, tagu..."
            />
          </label>
          <select
            aria-label="Przedmiot"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          >
            <option value="">Każdy przedmiot</option>
            {data.subjects.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Poziom"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            <option value="">Każdy poziom</option>
            {data.levels.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Tag"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
          >
            <option value="">Każdy tag</option>
            {data.tags.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            className={`button button--quiet${archived ? " selected" : ""}`}
            onClick={() => setArchived((value) => !value)}
          >
            <Archive size={16} />
            {archived ? "Aktywne" : "Archiwalne"}
          </button>
        </div>
        {data.templates.length ? (
          <div className="template-grid">
            {data.templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onClick={() => setSelected(template)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              filtered
                ? "Nie znaleziono pasującego szablonu."
                : archived
                  ? "Nie masz archiwalnych szablonów."
                  : "Pierwszy szablon skróci przygotowanie kolejnych lekcji."
            }
            action={
              !data.readOnly && !filtered && !archived ? (
                <button
                  className="button button--primary"
                  onClick={() => setEditor("new")}
                >
                  Utwórz szablon
                </button>
              ) : undefined
            }
          />
        )}
      </section>
      <TemplatePreview
        template={selected}
        readOnly={data.readOnly}
        pending={pending}
        onClose={() => setSelected(null)}
        onEdit={(value) => {
          setSelected(null);
          setEditor(value);
        }}
        onDuplicate={duplicate}
        onArchive={setArchiveTarget}
      />
      <TemplateEditor
        key={editor === "new" ? "new" : (editor?.id ?? "closed")}
        value={editor}
        data={data}
        onClose={() => setEditor(null)}
        onSaved={async (template, created) => {
          setEditor(null);
          setSelected(template);
          await refresh();
          showToast({
            message: created
              ? "Szablon został utworzony."
              : "Zmiany zostały zapisane.",
          });
        }}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Zarchiwizować szablon?"
        description="Zniknie z aktywnej listy. Lekcje, do których wcześniej skopiowano jego treść, nie zmienią się."
        confirmLabel="Archiwizuj"
        pending={pending}
        onConfirm={archiveTemplate}
      />
    </div>
  );
}

function TemplateCard({
  template,
  onClick,
}: {
  template: LessonTemplate;
  onClick: () => void;
}) {
  const minutes =
    template.estimatedDurationMinutes ??
    template.sections.reduce(
      (sum, item) => sum + (item.estimatedMinutes ?? 0),
      0,
    );
  return (
    <button className="template-card" onClick={onClick}>
      <span className="template-card__index">
        <Layers3 size={18} />
        {template.sections.length}
      </span>
      <span className="template-card__body">
        <span className="template-card__meta">
          {[template.subject, template.level].filter(Boolean).join(" · ") ||
            "Szablon ogólny"}
        </span>
        <strong>{template.title}</strong>
        <small>
          {template.description || template.objective || "Gotowy plan lekcji"}
        </small>
        <span className="template-card__tags">
          {template.tags.slice(0, 3).map((tag) => (
            <em key={tag.id}>
              <Tag size={11} />
              {tag.name}
            </em>
          ))}
        </span>
      </span>
      {minutes > 0 && (
        <span className="template-card__duration">
          <Clock3 size={14} />
          {minutes} min
        </span>
      )}
    </button>
  );
}

function TemplatePreview({
  template,
  readOnly,
  pending,
  onClose,
  onEdit,
  onDuplicate,
  onArchive,
}: {
  template: LessonTemplate | null;
  readOnly: boolean;
  pending: boolean;
  onClose: () => void;
  onEdit: (value: LessonTemplate) => void;
  onDuplicate: (value: LessonTemplate) => Promise<void>;
  onArchive: (value: LessonTemplate) => void;
}) {
  if (!template) return null;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-content--medium template-preview">
          <header className="dialog-header">
            <div>
              <span className="eyebrow">
                {[template.subject, template.level]
                  .filter(Boolean)
                  .join(" · ") || "Szablon lekcji"}
              </span>
              <Dialog.Title>{template.title}</Dialog.Title>
              <Dialog.Description>
                {template.description ||
                  "Plan gotowy do użycia podczas kolejnych zajęć."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Zamknij">
              <X size={19} />
            </Dialog.Close>
          </header>
          <div className="template-preview__content">
            {template.objective && (
              <section>
                <h3>Cel lekcji</h3>
                <p>{template.objective}</p>
              </section>
            )}
            <section>
              <h3>Plan lekcji</h3>
              <ol className="template-section-preview">
                {template.sections.map((section) => (
                  <li key={section.id}>
                    <span>{section.position + 1}</span>
                    <div>
                      <strong>{section.title}</strong>
                      {section.content && <p>{section.content}</p>}
                    </div>
                    {section.estimatedMinutes && (
                      <small>{section.estimatedMinutes} min</small>
                    )}
                  </li>
                ))}
              </ol>
            </section>
            {template.materials.length > 0 && (
              <section>
                <h3>Materiały</h3>
                <ul className="template-material-preview">
                  {template.materials.map((material) => (
                    <li key={material.id}>
                      <FileText size={15} />
                      {material.title}
                      {material.archived && <em>archiwalny</em>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {template.teacherNotes && (
              <section>
                <h3>Przygotowanie nauczyciela</h3>
                <p>{template.teacherNotes}</p>
              </section>
            )}
          </div>
          {!readOnly && !template.archived && (
            <footer className="dialog-footer">
              <button
                className="button button--quiet"
                onClick={() => onArchive(template)}
              >
                <Archive size={16} />
                Archiwizuj
              </button>
              <span />
              <button
                className="button button--secondary"
                disabled={pending}
                onClick={() => void onDuplicate(template)}
              >
                <Copy size={16} />
                Duplikuj
              </button>
              <button
                className="button button--primary"
                onClick={() => onEdit(template)}
              >
                <Pencil size={16} />
                Edytuj
              </button>
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TemplateEditor({
  value,
  data,
  onClose,
  onSaved,
}: {
  value: EditorValue;
  data: LessonTemplatesData;
  onClose: () => void;
  onSaved: (template: LessonTemplate, created: boolean) => Promise<void>;
}) {
  const editing = value && value !== "new" ? value : null;
  const { showError } = useAppUi();
  const [sections, setSections] = useState<
    Array<Omit<LessonTemplateSection, "position">>
  >(
    editing?.sections.map((section) => ({
      id: section.id,
      title: section.title,
      content: section.content,
      estimatedMinutes: section.estimatedMinutes,
    })) ?? [
      {
        id: crypto.randomUUID(),
        title: "Warm-up",
        content: "",
        estimatedMinutes: 10,
      },
    ],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!value) return null;
  function patchSection(
    index: number,
    patch: Partial<(typeof sections)[number]>,
  ) {
    setSections((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }
  function move(index: number, direction: -1 | 1) {
    setSections((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload: LessonTemplateInput = {
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      subject: String(form.get("subject") ?? ""),
      level: String(form.get("level") ?? ""),
      objective: String(form.get("objective") ?? ""),
      teacherNotes: String(form.get("teacherNotes") ?? ""),
      estimatedDurationMinutes:
        Number(form.get("estimatedDurationMinutes")) || undefined,
      sections: sections.map((item) => ({
        ...item,
        estimatedMinutes: item.estimatedMinutes || undefined,
      })),
      materialIds: form.getAll("materialIds").map(String),
      tagIds: form.getAll("tagIds").map(String),
    };
    try {
      const result = await api<LessonTemplate>(
        editing
          ? `/api/lesson-templates/${editing.id}`
          : "/api/lesson-templates",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await onSaved(result, !editing);
    } catch (caught) {
      const message =
        caught instanceof ClientApiError
          ? caught.data.message
          : "Nie udało się zapisać szablonu.";
      setError(message);
      showError(caught);
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog.Root open onOpenChange={(open) => !open && !pending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content template-editor">
          <header className="dialog-header">
            <div>
              <Dialog.Title>
                {editing ? "Edytuj szablon" : "Nowy szablon"}
              </Dialog.Title>
              <Dialog.Description>
                Zapisz wspólną strukturę, bez danych konkretnego ucznia.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="icon-button"
              aria-label="Zamknij"
              disabled={pending}
            >
              <X size={19} />
            </Dialog.Close>
          </header>
          <form onSubmit={submit}>
            <div className="template-editor__scroll">
              <div className="template-form-grid">
                <label className="field template-form-grid__wide">
                  <span>Nazwa</span>
                  <input
                    name="title"
                    defaultValue={editing?.title}
                    required
                    maxLength={160}
                    autoFocus
                    placeholder="np. Present Perfect — B1"
                  />
                </label>
                <label className="field template-form-grid__wide">
                  <span>
                    Opis <small>opcjonalnie</small>
                  </span>
                  <textarea
                    name="description"
                    defaultValue={editing?.description}
                    rows={2}
                    maxLength={2000}
                  />
                </label>
                <label className="field">
                  <span>Przedmiot</span>
                  <input
                    name="subject"
                    defaultValue={editing?.subject}
                    maxLength={80}
                    placeholder="np. Angielski"
                  />
                </label>
                <label className="field">
                  <span>Poziom</span>
                  <input
                    name="level"
                    defaultValue={editing?.level}
                    maxLength={40}
                    placeholder="np. B1"
                  />
                </label>
                <label className="field">
                  <span>Czas lekcji</span>
                  <input
                    name="estimatedDurationMinutes"
                    type="number"
                    min={1}
                    max={480}
                    defaultValue={editing?.estimatedDurationMinutes}
                    placeholder="60"
                  />
                </label>
                <label className="field template-form-grid__wide">
                  <span>Cel lekcji</span>
                  <textarea
                    name="objective"
                    defaultValue={editing?.objective}
                    rows={3}
                    maxLength={5000}
                  />
                </label>
              </div>
              <section className="template-builder">
                <div className="template-builder__heading">
                  <div>
                    <span className="eyebrow">Kolejność zajęć</span>
                    <h3>Plan lekcji</h3>
                  </div>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() =>
                      setSections((current) => [
                        ...current,
                        { id: crypto.randomUUID(), title: "", content: "" },
                      ])
                    }
                  >
                    <Plus size={16} />
                    Dodaj sekcję
                  </button>
                </div>
                <div className="template-section-list">
                  {sections.map((section, index) => (
                    <div className="template-section-row" key={section.id}>
                      <span className="template-section-row__number">
                        {index + 1}
                      </span>
                      <GripVertical size={16} aria-hidden="true" />
                      <div>
                        <input
                          aria-label={`Nazwa sekcji ${index + 1}`}
                          value={section.title}
                          required
                          maxLength={120}
                          onChange={(event) =>
                            patchSection(index, { title: event.target.value })
                          }
                          placeholder="np. Warm-up"
                        />
                        <textarea
                          aria-label={`Instrukcje sekcji ${index + 1}`}
                          value={section.content}
                          maxLength={5000}
                          rows={2}
                          onChange={(event) =>
                            patchSection(index, { content: event.target.value })
                          }
                          placeholder="Instrukcje dla prowadzącego"
                        />
                      </div>
                      <label>
                        <span className="sr-only">Minuty</span>
                        <input
                          type="number"
                          min={1}
                          max={480}
                          value={section.estimatedMinutes ?? ""}
                          onChange={(event) =>
                            patchSection(index, {
                              estimatedMinutes:
                                Number(event.target.value) || undefined,
                            })
                          }
                          placeholder="min"
                        />
                      </label>
                      <div className="template-section-row__actions">
                        <button
                          type="button"
                          aria-label="Przesuń wyżej"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Przesuń niżej"
                          disabled={index === sections.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Usuń sekcję"
                          onClick={() =>
                            setSections((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <div className="template-form-grid">
                <fieldset className="template-choice template-form-grid__wide">
                  <legend>Materiały</legend>
                  <p>
                    Odwołania prowadzą do istniejącej biblioteki; pliki nie są
                    kopiowane.
                  </p>
                  <div>
                    {data.materials.map((material) => (
                      <label key={material.id}>
                        <input
                          type="checkbox"
                          name="materialIds"
                          value={material.id}
                          defaultChecked={editing?.materials.some(
                            (item) => item.id === material.id,
                          )}
                        />
                        <FileText size={15} />
                        <span>
                          {material.title}
                          {material.archived ? " (archiwalny)" : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="template-choice template-form-grid__wide">
                  <legend>Tagi</legend>
                  <div>
                    {data.tags.map((tag) => (
                      <label key={tag.id}>
                        <input
                          type="checkbox"
                          name="tagIds"
                          value={tag.id}
                          defaultChecked={editing?.tags.some(
                            (item) => item.id === tag.id,
                          )}
                        />
                        <Tag size={14} />
                        <span>{tag.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="field template-form-grid__wide">
                  <span>
                    Notatki do przygotowania <small>prywatne</small>
                  </span>
                  <textarea
                    name="teacherNotes"
                    defaultValue={editing?.teacherNotes}
                    rows={4}
                    maxLength={20000}
                  />
                </label>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <footer className="dialog-footer">
              <Dialog.Close className="button button--quiet" disabled={pending}>
                Anuluj
              </Dialog.Close>
              <button className="button button--primary" disabled={pending}>
                {pending ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <BookOpenCheck size={17} />
                )}
                {editing ? "Zapisz zmiany" : "Zapisz szablon"}
              </button>
            </footer>
          </form>
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
