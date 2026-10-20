"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { materialsOptions } from "@/lib/workspace-queries";
import { useSessionTeacher } from "../app-shell";
import {
  Archive,
  BookOpenCheck,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  LibraryBig,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  StickyNote,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ClientApiError } from "@/lib/api-client";
import type {
  MaterialFolder,
  MaterialLibraryItem,
  MaterialsLibraryData,
  MaterialType,
} from "@/lib/materials";
import { useAppUi } from "../app-ui-context";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";

type FolderFilter = "all" | "none" | string;
type LibraryView = "active" | "archived";
const labels: Record<MaterialType, string> = {
  file: "Plik",
  link: "Link",
  text: "Tekst",
};
const icons = { file: FileText, link: Link2, text: StickyNote };

export function MaterialsPage() {
  const { showError, showToast } = useAppUi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teacher = useSessionTeacher();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const initialType = searchParams.get("type");
  const [type, setType] = useState<MaterialType | "">(
    isMaterialType(initialType) ? initialType : "",
  );
  const [subject, setSubject] = useState(searchParams.get("subject") ?? "");
  const [level, setLevel] = useState(searchParams.get("level") ?? "");
  const [folder, setFolder] = useState<FolderFilter>(
    searchParams.get("folder") ?? "all",
  );
  const [tag, setTag] = useState(searchParams.get("tag") ?? "");
  const [view, setView] = useState<LibraryView>(
    searchParams.get("view") === "archived" ? "archived" : "active",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [composer, setComposer] = useState<MaterialLibraryItem | "new" | null>(
    searchParams.get("action") === "new" ? "new" : null,
  );
  const [selected, setSelected] = useState<MaterialLibraryItem | null>(null);
  const [archiveTarget, setArchiveTarget] =
    useState<MaterialLibraryItem | null>(null);
  const [archiving, setArchiving] = useState(false);

  const queryString = useMemo(() => {
    const query = new URLSearchParams();
    if (search.trim()) query.set("q", search.trim());
    if (type) query.set("type", type);
    if (subject) query.set("subject", subject);
    if (level) query.set("level", level);
    if (folder !== "all") query.set("folder", folder);
    if (tag) query.set("tag", tag);
    if (view === "archived") query.set("view", "archived");
    return query.toString();
  }, [folder, level, search, subject, tag, type, view]);

  const [debouncedQuery, setDebouncedQuery] = useState(queryString);
  const {
    data,
    isPending: loading,
    error,
    isFetching,
  } = useQuery({
    ...materialsOptions(teacher.id, debouncedQuery),
    placeholderData: keepPreviousData,
  });

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: ["materials", teacher.id],
      refetchType: "none",
    });
    return queryClient.fetchQuery(materialsOptions(teacher.id, debouncedQuery));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(queryString);
      if (searchParams.toString() !== queryString) {
        router.replace(
          `/app/materialy${queryString ? `?${queryString}` : ""}`,
          {
            scroll: false,
          },
        );
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryString, router, searchParams]);

  useEffect(() => {
    if (error) showError(error);
  }, [error, showError]);

  const hasFilters = Boolean(
    search || type || subject || level || tag || folder !== "all",
  );
  const activeFilterCount = [
    type,
    subject,
    level,
    tag,
    folder !== "all" ? folder : "",
  ].filter(Boolean).length;
  if (loading && !data) return <PageLoading />;
  if (!data)
    return (
      <p role="alert">
        Nie udało się wczytać materiałów.{" "}
        <button onClick={() => void refresh().catch(showError)}>
          Spróbuj ponownie
        </button>
      </p>
    );

  function clearFilters() {
    setSearch("");
    setType("");
    setSubject("");
    setLevel("");
    setFolder("all");
    setTag("");
    setView("active");
  }
  async function confirmArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await apiRequest(`/api/materials/${archiveTarget.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      setSelected(null);
      setArchiveTarget(null);
      await refresh();
      showToast({ message: "Materiał został zarchiwizowany." });
    } catch (error) {
      showError(error);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="materials-page page-enter">
      <header
        className="page-header materials-header"
        data-tour="materials-overview"
      >
        <div>
          <p className="eyebrow">Twoja półka</p>
          <h1>Materiały</h1>
          <p className="page-intro">
            Pliki, linki i własne ćwiczenia — uporządkowane i gotowe do kolejnej
            lekcji.
          </p>
        </div>
        <div className="materials-header__actions">
          <Link
            className="button button--secondary"
            href="/app/materialy/biblioteka"
          >
            <LibraryBig size={18} />
            Biblioteka szablonów
          </Link>
          <Link
            className="button button--secondary"
            href="/app/materialy/szablony"
          >
            <BookOpenCheck size={18} />
            Szablony lekcji
          </Link>
          <button
            className="button button--primary"
            disabled={data.readOnly}
            onClick={() => setComposer("new")}
          >
            <Plus size={18} />
            Dodaj materiał
          </button>
        </div>
      </header>
      <section
        className="materials-library"
        aria-label="Biblioteka materiałów"
        aria-busy={isFetching}
      >
        <div className="materials-toolbar">
          <label className="search-field materials-search">
            <Search size={18} />
            <span className="sr-only">Szukaj materiałów</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Szukaj tytułu, opisu, tagu..."
            />
          </label>
          <button
            className="button button--secondary materials-filter-trigger"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal size={17} />
            Filtry {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
          </button>
          <div className="materials-selects materials-selects--desktop">
            <FilterFields
              data={data}
              type={type}
              subject={subject}
              level={level}
              tag={tag}
              onType={setType}
              onSubject={setSubject}
              onLevel={setLevel}
              onTag={setTag}
            />
          </div>
          {hasFilters && (
            <button
              className="text-link materials-clear"
              onClick={clearFilters}
            >
              Wyczyść filtry
            </button>
          )}
        </div>
        <div className="materials-layout">
          <aside className="materials-folders" aria-label="Foldery">
            <div className="materials-folders__heading">
              <strong>Foldery</strong>
              {!data.readOnly && (
                <button
                  className="icon-button"
                  aria-label="Zarządzaj folderami"
                  onClick={() => setFoldersOpen(true)}
                >
                  <Settings2 size={16} />
                </button>
              )}
            </div>
            <FolderButton
              selected={folder === "all" && view === "active"}
              icon={<FolderOpen size={17} />}
              onClick={() => {
                setFolder("all");
                setView("active");
              }}
            >
              Wszystkie
            </FolderButton>
            <FolderButton
              selected={folder === "none" && view === "active"}
              icon={<Folder size={17} />}
              onClick={() => {
                setFolder("none");
                setView("active");
              }}
            >
              Bez folderu
            </FolderButton>
            {data.folders.map((item) => (
              <FolderButton
                key={item.id}
                selected={folder === item.id && view === "active"}
                icon={<Folder size={17} />}
                onClick={() => {
                  setFolder(item.id);
                  setView("active");
                }}
              >
                {item.name}
              </FolderButton>
            ))}
            <span className="materials-folders__divider" />
            <FolderButton
              selected={view === "archived"}
              icon={<Archive size={17} />}
              onClick={() => {
                setFolder("all");
                setView("archived");
              }}
            >
              Archiwalne
            </FolderButton>
          </aside>
          <div className="materials-results">
            <div className="materials-results__mobile-folder">
              <select
                value={view === "archived" ? "archived" : folder}
                onChange={(event) => {
                  if (event.target.value === "archived") {
                    setView("archived");
                    setFolder("all");
                  } else {
                    setView("active");
                    setFolder(event.target.value);
                  }
                }}
                aria-label="Folder"
              >
                <option value="all">Wszystkie materiały</option>
                <option value="none">Bez folderu</option>
                {data.folders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
                <option value="archived">Archiwalne</option>
              </select>
            </div>
            {data.materials.length ? (
              <div className="material-grid">
                {data.materials.map((material) => (
                  <MaterialCard
                    key={material.id}
                    material={material}
                    onOpen={() => setSelected(material)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={
                  hasFilters
                    ? "Nie znaleziono materiałów pasujących do filtrów."
                    : view === "archived"
                      ? "Nie masz archiwalnych materiałów."
                      : "Ten folder jest pusty."
                }
                action={
                  !data.readOnly && !hasFilters && view !== "archived" ? (
                    <button
                      className="button button--primary"
                      onClick={() => setComposer("new")}
                    >
                      Dodaj materiał
                    </button>
                  ) : hasFilters ? (
                    <button
                      className="button button--secondary"
                      onClick={clearFilters}
                    >
                      Wyczyść filtry
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>
        </div>
      </section>
      <FiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        data={data}
        folder={folder}
        type={type}
        subject={subject}
        level={level}
        tag={tag}
        onFolder={setFolder}
        onType={setType}
        onSubject={setSubject}
        onLevel={setLevel}
        onTag={setTag}
        onClear={clearFilters}
      />
      <FolderManager
        open={foldersOpen}
        onOpenChange={setFoldersOpen}
        folders={data.folders}
        onChanged={async () => {
          const next = await refresh();
          if (
            folder !== "all" &&
            folder !== "none" &&
            !next.folders.some((item) => item.id === folder)
          )
            setFolder("all");
        }}
      />
      <MaterialDetail
        material={selected}
        readOnly={data.readOnly}
        folders={data.folders}
        onOpenChange={(open) => !open && setSelected(null)}
        onEdit={(material) => {
          setSelected(null);
          setComposer(material);
        }}
        onArchive={setArchiveTarget}
        onMoved={async (material) => {
          setSelected(material);
          await refresh();
        }}
      />
      <MaterialComposer
        key={composer === "new" ? "new" : (composer?.id ?? "closed")}
        value={composer}
        folders={data.folders}
        tags={data.tags}
        onOpenChange={(open) => !open && setComposer(null)}
        onSaved={async (material, created) => {
          setComposer(null);
          setSelected(material);
          await refresh();
          showToast({
            message: created
              ? "Materiał został dodany."
              : "Zmiany zostały zapisane.",
          });
        }}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Zarchiwizować materiał?"
        description="Materiał zachowa folder i tagi oraz pozostanie przy historycznych lekcjach."
        confirmLabel="Archiwizuj"
        pending={archiving}
        onConfirm={confirmArchive}
      />
    </div>
  );
}

function FolderButton({
  selected,
  icon,
  onClick,
  children,
}: {
  selected: boolean;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={selected ? "selected" : ""}
      aria-current={selected ? "page" : undefined}
      onClick={onClick}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

type FilterProps = {
  data: MaterialsLibraryData;
  type: MaterialType | "";
  subject: string;
  level: string;
  tag: string;
  onType: (value: MaterialType | "") => void;
  onSubject: (value: string) => void;
  onLevel: (value: string) => void;
  onTag: (value: string) => void;
};
function FilterFields({
  data,
  type,
  subject,
  level,
  tag,
  onType,
  onSubject,
  onLevel,
  onTag,
}: FilterProps) {
  return (
    <>
      <label>
        <span className="sr-only">Typ</span>
        <select
          value={type}
          onChange={(event) => onType(event.target.value as MaterialType | "")}
        >
          <option value="">Każdy typ</option>
          <option value="file">PDF i pliki</option>
          <option value="link">Linki</option>
          <option value="text">Teksty</option>
        </select>
      </label>
      <label>
        <span className="sr-only">Przedmiot</span>
        <select
          value={subject}
          onChange={(event) => onSubject(event.target.value)}
        >
          <option value="">Każdy przedmiot</option>
          {data.subjects.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Poziom</span>
        <select value={level} onChange={(event) => onLevel(event.target.value)}>
          <option value="">Każdy poziom</option>
          {data.levels.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Tag</span>
        <select value={tag} onChange={(event) => onTag(event.target.value)}>
          <option value="">Każdy tag</option>
          {data.tags.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function FiltersDialog(
  props: FilterProps & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folder: FolderFilter;
    onFolder: (value: FolderFilter) => void;
    onClear: () => void;
  },
) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content materials-filter-dialog">
          <header className="dialog-header">
            <Dialog.Title>Filtry</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Zamknij">
              <X size={19} />
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            Filtruj materiały.
          </Dialog.Description>
          <div className="materials-filter-dialog__fields">
            <label className="field">
              <span>Folder</span>
              <select
                value={props.folder}
                onChange={(event) => props.onFolder(event.target.value)}
              >
                <option value="all">Wszystkie</option>
                <option value="none">Bez folderu</option>
                {props.data.folders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <FilterFields {...props} />
          </div>
          <footer className="dialog-footer">
            <button className="button button--quiet" onClick={props.onClear}>
              Wyczyść filtry
            </button>
            <Dialog.Close className="button button--primary">
              Pokaż wyniki
            </Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MaterialCard({
  material,
  onOpen,
}: {
  material: MaterialLibraryItem;
  onOpen: () => void;
}) {
  const Icon = icons[material.type];
  return (
    <button
      className={`material-card material-card--${material.type}`}
      onClick={onOpen}
    >
      <span className="material-card__rail" />
      <span className="material-card__icon">
        <Icon size={20} />
      </span>
      <span className="material-card__body">
        <strong>{material.title}</strong>
        <span>
          {[labels[material.type], material.subject, material.level]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {material.description && <small>{material.description}</small>}
        <span className="material-card__organization">
          {material.folder && (
            <em>
              <Folder size={12} />
              {material.folder.name}
            </em>
          )}
          {material.tags.slice(0, 3).map((item) => (
            <em key={item.id}>
              <Tag size={11} />
              {item.name}
            </em>
          ))}
        </span>
      </span>
      <span className="material-card__open">Otwórz ›</span>
    </button>
  );
}

function MaterialDetail({
  material,
  readOnly,
  folders,
  onOpenChange,
  onEdit,
  onArchive,
  onMoved,
}: {
  material: MaterialLibraryItem | null;
  readOnly: boolean;
  folders: MaterialFolder[];
  onOpenChange: (open: boolean) => void;
  onEdit: (material: MaterialLibraryItem) => void;
  onArchive: (material: MaterialLibraryItem) => void;
  onMoved: (material: MaterialLibraryItem) => Promise<void>;
}) {
  const { showError, showToast } = useAppUi();
  if (!material) return null;
  const Icon = icons[material.type];
  const openHref =
    material.type === "file"
      ? `/api/materials/${material.id}/open`
      : material.externalUrl;
  async function move(folderId: string) {
    try {
      const form = materialFormFromItem(material!);
      form.set("folderId", folderId);
      const updated = await apiRequest<MaterialLibraryItem>(
        `/api/materials/${material!.id}`,
        { method: "PATCH", body: form },
      );
      await onMoved(updated);
      showToast({
        message: folderId
          ? "Materiał został przeniesiony."
          : "Materiał jest teraz bez folderu.",
      });
    } catch (error) {
      showError(error);
    }
  }
  return (
    <Dialog.Root open onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-content--medium material-detail">
          <header className="dialog-header">
            <div className="material-detail__title">
              <span
                className={`material-card__icon material-card__icon--${material.type}`}
              >
                <Icon size={20} />
              </span>
              <div>
                <Dialog.Title>{material.title}</Dialog.Title>
                <span>{labels[material.type]}</span>
              </div>
            </div>
            <Dialog.Close className="icon-button" aria-label="Zamknij">
              <X size={19} />
            </Dialog.Close>
          </header>
          <Dialog.Description asChild>
            <div className="material-detail__content">
              {material.description && <p>{material.description}</p>}
              {material.type === "text" && <pre>{material.textContent}</pre>}
              {material.type === "file" && (
                <div className="material-file-summary">
                  <FileText size={28} />
                  <span>
                    <strong>
                      {material.originalFilename ?? material.title}
                    </strong>
                    <small>{formatBytes(material.fileSizeBytes)}</small>
                  </span>
                </div>
              )}
              {material.type === "link" && (
                <p className="material-url">{material.externalUrl}</p>
              )}
              <dl className="material-meta">
                <div>
                  <dt>Przedmiot</dt>
                  <dd>{material.subject || "—"}</dd>
                </div>
                <div>
                  <dt>Poziom</dt>
                  <dd>{material.level || "—"}</dd>
                </div>
                <div>
                  <dt>Folder</dt>
                  <dd>{material.folder?.name ?? "Bez folderu"}</dd>
                </div>
              </dl>
              {material.tags.length > 0 && (
                <div className="material-tag-list">
                  {material.tags.map((item) => (
                    <span key={item.id}>
                      <Tag size={12} />
                      {item.name}
                    </span>
                  ))}
                </div>
              )}
              {!readOnly && !material.archived && (
                <label className="field material-detail__move">
                  <span>Przenieś do folderu</span>
                  <select
                    value={material.folder?.id ?? ""}
                    onChange={(event) => void move(event.target.value)}
                  >
                    <option value="">Bez folderu</option>
                    {folders.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </Dialog.Description>
          <footer className="dialog-footer material-detail__footer">
            {!readOnly && !material.archived && (
              <button
                className="button button--quiet"
                onClick={() => onArchive(material)}
              >
                <Archive size={17} />
                Archiwizuj
              </button>
            )}
            <span />
            {!readOnly && !material.archived && (
              <button
                className="button button--secondary"
                onClick={() => onEdit(material)}
              >
                <Pencil size={17} />
                Edytuj
              </button>
            )}
            {openHref && (
              <a
                className="button button--primary"
                href={openHref}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={17} />
                {material.type === "file" ? "Otwórz plik" : "Otwórz link"}
              </a>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MaterialComposer({
  value,
  folders,
  tags,
  onOpenChange,
  onSaved,
}: {
  value: MaterialLibraryItem | "new" | null;
  folders: MaterialFolder[];
  tags: MaterialsLibraryData["tags"];
  onOpenChange: (open: boolean) => void;
  onSaved: (material: MaterialLibraryItem, created: boolean) => Promise<void>;
}) {
  const { showError } = useAppUi();
  const editing = value && value !== "new" ? value : null;
  const [type, setType] = useState<MaterialType>(editing?.type ?? "file");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!value) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    form.set("type", type);
    try {
      const material = await apiRequest<MaterialLibraryItem>(
        editing ? `/api/materials/${editing.id}` : "/api/materials",
        { method: editing ? "PATCH" : "POST", body: form },
      );
      await onSaved(material, !editing);
    } catch (caught) {
      const message =
        caught instanceof ClientApiError
          ? caught.data.message
          : "Nie udało się zapisać materiału.";
      setError(message);
      showError(caught);
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog.Root open onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-content--medium material-composer">
          <header className="dialog-header">
            <Dialog.Title>
              {editing ? "Edytuj materiał" : "Dodaj materiał"}
            </Dialog.Title>
            <Dialog.Close
              className="icon-button"
              aria-label="Zamknij"
              disabled={pending}
            >
              <X size={19} />
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            Zapisz materiał do biblioteki.
          </Dialog.Description>
          <form onSubmit={submit}>
            <fieldset
              className="material-type-choice"
              disabled={Boolean(editing) || pending}
            >
              <legend>Typ</legend>
              {(["file", "link", "text"] as const).map((item) => {
                const Icon = icons[item];
                return (
                  <label key={item} className={type === item ? "selected" : ""}>
                    <input
                      type="radio"
                      checked={type === item}
                      onChange={() => setType(item)}
                    />
                    <Icon size={18} />
                    {labels[item]}
                  </label>
                );
              })}
            </fieldset>
            <div className="material-form-grid">
              <label className="field material-form-grid__wide">
                <span>Tytuł</span>
                <input
                  name="title"
                  defaultValue={editing?.title}
                  required
                  maxLength={160}
                  autoFocus
                />
              </label>
              <label className="field material-form-grid__wide">
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
                <span>
                  Przedmiot <small>opcjonalnie</small>
                </span>
                <input
                  name="subject"
                  defaultValue={editing?.subject}
                  maxLength={80}
                  placeholder="np. Angielski"
                />
              </label>
              <label className="field">
                <span>
                  Poziom <small>opcjonalnie</small>
                </span>
                <input
                  name="level"
                  defaultValue={editing?.level}
                  maxLength={40}
                  placeholder="np. B1"
                />
              </label>
              <label className="field">
                <span>
                  Folder <small>opcjonalnie</small>
                </span>
                <select
                  name="folderId"
                  defaultValue={editing?.folder?.id ?? ""}
                >
                  <option value="">Bez folderu</option>
                  {folders.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="material-tags-field">
                <legend>
                  Tagi <small>opcjonalnie</small>
                </legend>
                <div>
                  {tags.map((item) => (
                    <label key={item.id}>
                      <input
                        type="checkbox"
                        name="tagIds"
                        value={item.id}
                        defaultChecked={editing?.tags.some(
                          (tag) => tag.id === item.id,
                        )}
                      />
                      <span>{item.name}</span>
                    </label>
                  ))}
                </div>
                <input
                  name="newTagNames"
                  placeholder="Nowe tagi, oddzielone przecinkami"
                  aria-label="Nowe tagi"
                />
              </fieldset>
              {type === "link" && (
                <label className="field material-form-grid__wide">
                  <span>Adres URL</span>
                  <input
                    name="externalUrl"
                    type="url"
                    defaultValue={editing?.externalUrl}
                    required
                    placeholder="https://..."
                  />
                </label>
              )}
              {type === "text" && (
                <label className="field material-form-grid__wide">
                  <span>Treść</span>
                  <textarea
                    className="material-textarea"
                    name="textContent"
                    defaultValue={editing?.textContent}
                    required
                    rows={10}
                    maxLength={50000}
                  />
                </label>
              )}
              {type === "file" && (
                <label className="material-upload material-form-grid__wide">
                  <Upload size={24} />
                  <span>
                    <strong>
                      {editing ? "Zastąp plik (opcjonalnie)" : "Wybierz plik"}
                    </strong>
                    <small>PDF, JPG, PNG, WEBP, DOC lub DOCX · do 10 MB</small>
                  </span>
                  <input
                    name="file"
                    type="file"
                    required={!editing}
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  />
                </label>
              )}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <footer className="dialog-footer">
              <Dialog.Close className="button button--quiet" disabled={pending}>
                Anuluj
              </Dialog.Close>
              <button className="button button--primary" disabled={pending}>
                {pending && <LoaderCircle className="spin" size={17} />}
                {editing ? "Zapisz zmiany" : "Zapisz materiał"}
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FolderManager({
  open,
  onOpenChange,
  folders,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: MaterialFolder[];
  onChanged: () => Promise<void>;
}) {
  const { showError, showToast } = useAppUi();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<MaterialFolder | null>(null);
  const [deleting, setDeleting] = useState<MaterialFolder | null>(null);
  const [pending, setPending] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await apiRequest(
        editing
          ? `/api/materials/folders/${editing.id}`
          : "/api/materials/folders",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const wasEditing = Boolean(editing);
      setName("");
      setEditing(null);
      await onChanged();
      showToast({
        message: wasEditing
          ? "Nazwa folderu została zmieniona."
          : "Folder został utworzony.",
      });
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setPending(true);
    try {
      await apiRequest(`/api/materials/folders/${deleting.id}`, {
        method: "DELETE",
      });
      setDeleting(null);
      await onChanged();
      showToast({
        message: "Folder usunięto. Materiały są teraz bez folderu.",
      });
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content dialog-content--small folder-manager">
            <header className="dialog-header">
              <div>
                <Dialog.Title>Foldery</Dialog.Title>
                <Dialog.Description>
                  Jedna prosta warstwa organizacji materiałów.
                </Dialog.Description>
              </div>
              <Dialog.Close className="icon-button" aria-label="Zamknij">
                <X size={19} />
              </Dialog.Close>
            </header>
            <form className="folder-manager__form" onSubmit={save}>
              <label className="field">
                <span>{editing ? "Nowa nazwa" : "Nowy folder"}</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  required
                  placeholder="np. Grammar"
                />
              </label>
              <button className="button button--primary" disabled={pending}>
                <FolderPlus size={17} />
                {editing ? "Zapisz" : "Dodaj"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => {
                    setEditing(null);
                    setName("");
                  }}
                >
                  Anuluj
                </button>
              )}
            </form>
            <div className="folder-manager__list">
              {folders.map((folder) => (
                <div key={folder.id}>
                  <Folder size={17} />
                  <span>{folder.name}</span>
                  <button
                    className="icon-button"
                    aria-label={`Zmień nazwę ${folder.name}`}
                    onClick={() => {
                      setEditing(folder);
                      setName(folder.name);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button icon-button--danger"
                    aria-label={`Usuń ${folder.name}`}
                    onClick={() => setDeleting(folder)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {folders.length === 0 && <p>Nie masz jeszcze folderów.</p>}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(value) => !value && setDeleting(null)}
        title={`Usunąć folder „${deleting?.name ?? ""}”?`}
        description="Materiały nie zostaną usunięte — wrócą do sekcji Bez folderu."
        confirmLabel="Usuń folder"
        pending={pending}
        onConfirm={remove}
      />
    </>
  );
}

function materialFormFromItem(material: MaterialLibraryItem) {
  const form = new FormData();
  form.set("type", material.type);
  form.set("title", material.title);
  form.set("description", material.description);
  form.set("subject", material.subject);
  form.set("level", material.level);
  form.set("folderId", material.folder?.id ?? "");
  material.tags.forEach((tag) => form.append("tagIds", tag.id));
  if (material.externalUrl) form.set("externalUrl", material.externalUrl);
  if (material.textContent) form.set("textContent", material.textContent);
  return form;
}
async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T | { code: string; message: string };
  if (!response.ok) throw new ClientApiError(response.status, body as never);
  return body as T;
}
function isMaterialType(value: string | null): value is MaterialType {
  return value === "file" || value === "link" || value === "text";
}
function formatBytes(bytes?: number) {
  if (!bytes) return "Plik prywatny";
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
