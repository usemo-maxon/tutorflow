"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ClientApiError } from "@/lib/api-client";
import type {
  AssignedMaterial,
  GroupMaterialsData,
  StudentMaterialsData,
} from "@/lib/context-materials";
import { composeStudentResourceContext } from "@/lib/context-materials";
import type {
  MaterialLibraryItem,
  MaterialsLibraryData,
  MaterialType,
} from "@/lib/materials";
import { useAppUi } from "./app-ui-context";
import { EmptyState } from "./ui/empty-state";
import type { StudentHomeworkItem } from "@/lib/homework";
import { homeworkStatusLabels } from "@/lib/homework";
import { formatDay } from "@/lib/format";
import Link from "next/link";

type Props = {
  kind: "student" | "group";
  contextId: string;
  teacherId: string;
  readOnly: boolean;
};
type ContextData = StudentMaterialsData | GroupMaterialsData;

const typeLabels: Record<MaterialType, string> = {
  file: "Plik",
  link: "Link",
  text: "Tekst",
};
const typeIcons = { file: FileText, link: Link2, text: StickyNote };

export function ContextMaterials({
  kind,
  contextId,
  teacherId,
  readOnly,
}: Props) {
  const { showError, showToast } = useAppUi();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<MaterialLibraryItem | null>(null);
  const endpoint = `/api/${kind === "student" ? "students" : "groups"}/${encodeURIComponent(contextId)}/materials`;
  const queryKey = ["context-materials", teacherId, kind, contextId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      request<ContextData>(endpoint, { signal, cache: "no-store" }),
    staleTime: 30_000,
  });
  const mutation = useMutation({
    mutationFn: ({
      materialId,
      method,
    }: {
      materialId: string;
      method: "POST" | "DELETE";
    }) =>
      request(
        method === "POST"
          ? endpoint
          : `${endpoint}?materialId=${encodeURIComponent(materialId)}`,
        method === "POST"
          ? {
              method,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ materialId }),
            }
          : { method },
      ),
    async onSuccess(_result, variables) {
      await queryClient.invalidateQueries({ queryKey });
      showToast({
        message:
          variables.method === "POST"
            ? "Materiał został przypisany."
            : "Przypisanie materiału zostało usunięte.",
      });
    },
    onError: showError,
  });

  const direct = query.data
    ? "direct" in query.data
      ? query.data.direct
      : query.data.materials
    : [];
  const inherited =
    query.data && "fromGroups" in query.data ? query.data.fromGroups : [];
  const assignedIds = new Set([...direct, ...inherited].map((item) => item.id));

  return (
    <>
      <section
        className="context-materials"
        aria-labelledby={`${kind}-materials-heading`}
      >
        <div className="section-heading context-materials__heading">
          <div>
            <p className="eyebrow">Stałe zasoby</p>
            <h2 id={`${kind}-materials-heading`}>
              {kind === "student" ? "Materiały ucznia" : "Materiały grupy"}
            </h2>
          </div>
          {!readOnly && (
            <button
              className="button button--primary"
              onClick={() => setPickerOpen(true)}
            >
              <Plus size={17} /> Dodaj materiał
            </button>
          )}
        </div>
        {query.isPending ? (
          <div className="context-materials__loading">
            <LoaderCircle className="spin" size={20} /> Wczytywanie materiałów…
          </div>
        ) : query.isError ? (
          <EmptyState
            title="Nie udało się wczytać materiałów."
            action={
              <button
                className="button button--secondary"
                onClick={() => query.refetch()}
              >
                Spróbuj ponownie
              </button>
            }
          />
        ) : direct.length ? (
          <MaterialList
            materials={direct}
            canRemove={!readOnly}
            removingId={
              mutation.isPending ? mutation.variables?.materialId : undefined
            }
            onOpen={setPreview}
            onRemove={(materialId) =>
              mutation.mutate({ materialId, method: "DELETE" })
            }
          />
        ) : (
          <EmptyState
            title={
              kind === "student"
                ? "Uczeń nie ma jeszcze przypisanych materiałów."
                : "Grupa nie ma jeszcze wspólnych materiałów."
            }
          />
        )}
      </section>

      {kind === "student" && inherited.length > 0 && (
        <section
          className="context-materials context-materials--inherited"
          aria-labelledby="group-materials-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Z aktualnych grup</p>
              <h2 id="group-materials-heading">Materiały z grup</h2>
            </div>
          </div>
          <MaterialList
            materials={inherited}
            canRemove={false}
            onOpen={setPreview}
          />
        </section>
      )}

      <MaterialPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        assignedIds={assignedIds}
        pendingId={
          mutation.isPending ? mutation.variables?.materialId : undefined
        }
        onAssign={(materialId) =>
          mutation.mutate({ materialId, method: "POST" })
        }
        onOpen={setPreview}
      />
      <MaterialPreview
        material={preview}
        onOpenChange={(open) => !open && setPreview(null)}
      />
    </>
  );
}

export function StudentResourceOverview({
  studentId,
  teacherId,
  timezone,
  homeworks,
}: {
  studentId: string;
  teacherId: string;
  timezone: string;
  homeworks: StudentHomeworkItem[];
}) {
  const [preview, setPreview] = useState<MaterialLibraryItem | null>(null);
  const query = useQuery({
    queryKey: ["context-materials", teacherId, "student", studentId],
    queryFn: ({ signal }) =>
      request<StudentMaterialsData>(
        `/api/students/${encodeURIComponent(studentId)}/materials`,
        { signal, cache: "no-store" },
      ),
    staleTime: 30_000,
  });
  const resources = useMemo(() => {
    if (!query.data) return [];
    return composeStudentResourceContext(query.data).map((item) => ({
      ...item,
      provenance: item.sources.map((source) => {
        if (source.kind === "student") return "Materiał ucznia";
        if (source.kind === "group") {
          return source.group
            ? `Grupa: ${source.group.name}`
            : "Materiał grupy";
        }
        return `Lekcja ${formatDay(source.lesson.startsAt, timezone)}${source.lesson.topic ? ` · ${source.lesson.topic}` : ""}`;
      }),
    }));
  }, [query.data, timezone]);
  const visibleHomework = homeworks
    .filter((item) =>
      ["assigned", "completed", "reviewed"].includes(item.status),
    )
    .slice(0, 4);

  return (
    <>
      <section
        className="student-resource-overview panel"
        aria-labelledby="student-resource-overview-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Kontekst zasobów</p>
            <h2 id="student-resource-overview-title">
              Ostatnie materiały i zadania
            </h2>
          </div>
          <FileText size={21} aria-hidden="true" />
        </div>
        <div className="student-resource-overview__grid">
          <div>
            <h3>Materiały</h3>
            {query.isPending ? (
              <p className="memory-section-empty">Wczytywanie materiałów…</p>
            ) : query.isError ? (
              <p className="memory-section-empty">
                Nie udało się wczytać kontekstu materiałów.
              </p>
            ) : resources.length ? (
              <div className="student-resource-overview__list">
                {resources.map(({ material, provenance }) => (
                  <button
                    type="button"
                    key={material.id}
                    onClick={() => setPreview(material)}
                  >
                    <span>
                      <strong>{material.title}</strong>
                      <small>
                        {typeLabels[material.type]}
                        {material.archived ? " · Archiwalny" : ""}
                      </small>
                    </span>
                    <em>{provenance.join(" · ")}</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className="memory-section-empty">
                Brak ostatnich lub przypisanych materiałów.
              </p>
            )}
          </div>
          <div>
            <h3>Praca domowa</h3>
            {visibleHomework.length ? (
              <div className="student-resource-overview__homework">
                {visibleHomework.map((item) => (
                  <Link
                    href={`/app/lekcje/${item.sourceLessonId}`}
                    key={item.id}
                  >
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.overdue
                          ? "Po terminie"
                          : item.status === "completed"
                            ? "Do sprawdzenia"
                            : homeworkStatusLabels[item.status]}
                      </small>
                    </span>
                    <ExternalLink size={14} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="memory-section-empty">
                Brak oczekujących lub sprawdzonych zadań.
              </p>
            )}
          </div>
        </div>
      </section>
      <MaterialPreview
        material={preview}
        onOpenChange={(open) => !open && setPreview(null)}
      />
    </>
  );
}

function MaterialList({
  materials,
  canRemove,
  removingId,
  onOpen,
  onRemove,
}: {
  materials: AssignedMaterial[];
  canRemove: boolean;
  removingId?: string;
  onOpen: (material: MaterialLibraryItem) => void;
  onRemove?: (materialId: string) => void;
}) {
  return (
    <div className="context-material-list">
      {materials.map((material) => {
        const Icon = typeIcons[material.type];
        return (
          <article
            className="context-material-card"
            key={`${material.source}-${material.group?.id ?? "direct"}-${material.id}`}
          >
            <button
              className="context-material-card__main"
              onClick={() => onOpen(material)}
            >
              <span className="context-material-card__icon">
                <Icon size={19} />
              </span>
              <span>
                <strong>{material.title}</strong>
                <small>
                  {[typeLabels[material.type], material.subject, material.level]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
                {material.group && (
                  <em>
                    <Users size={13} /> {material.group.name}
                  </em>
                )}
              </span>
            </button>
            <div className="context-material-card__actions">
              {material.archived && (
                <span className="material-archived-badge">
                  <Archive size={13} /> Archiwalny
                </span>
              )}
              {canRemove && onRemove && (
                <button
                  className="icon-button"
                  aria-label={`Usuń przypisanie materiału ${material.title}`}
                  disabled={removingId === material.id}
                  onClick={() => onRemove(material.id)}
                >
                  {removingId === material.id ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function MaterialPicker({
  open,
  onOpenChange,
  assignedIds,
  pendingId,
  onAssign,
  onOpen,
  actionLabel = "Przypisz",
  assignedLabel = "Przypisany",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignedIds: Set<string>;
  pendingId?: string;
  onAssign: (materialId: string) => void;
  onOpen: (material: MaterialLibraryItem) => void;
  actionLabel?: string;
  assignedLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [folder, setFolder] = useState("");
  const [tag, setTag] = useState("");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("");
  const params = useMemo(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("q", search.trim());
    if (type) next.set("type", type);
    if (folder) next.set("folder", folder);
    if (tag) next.set("tag", tag);
    if (subject) next.set("subject", subject);
    if (level) next.set("level", level);
    return next.toString();
  }, [folder, level, search, subject, tag, type]);
  const library = useQuery({
    queryKey: ["material-picker", params],
    queryFn: ({ signal }) =>
      request<MaterialsLibraryData>(
        `/api/materials${params ? `?${params}` : ""}`,
        { signal, cache: "no-store" },
      ),
    enabled: open,
    staleTime: 15_000,
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content context-material-picker">
          <div className="dialog-header">
            <div>
              <Dialog.Title>Dodaj materiał</Dialog.Title>
              <Dialog.Description>
                Wybierz istniejący materiał z biblioteki.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Zamknij">
              <X size={18} />
            </Dialog.Close>
          </div>
          <label className="search-field context-material-picker__search">
            <Search size={18} />
            <span className="sr-only">Szukaj materiałów</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Szukaj tytułu, opisu lub tagu…"
            />
          </label>
          <div className="context-material-picker__filters">
            <select
              aria-label="Typ"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="">Każdy typ</option>
              <option value="file">Plik</option>
              <option value="link">Link</option>
              <option value="text">Tekst</option>
            </select>
            <select
              aria-label="Folder"
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
            >
              <option value="">Każdy folder</option>
              <option value="none">Bez folderu</option>
              {library.data?.folders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Tag"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
            >
              <option value="">Każdy tag</option>
              {library.data?.tags.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Przedmiot"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            >
              <option value="">Każdy przedmiot</option>
              {library.data?.subjects.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              aria-label="Poziom"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              <option value="">Każdy poziom</option>
              {library.data?.levels.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="context-material-picker__results">
            {library.isPending ? (
              <div className="context-materials__loading">
                <LoaderCircle className="spin" size={20} /> Szukanie…
              </div>
            ) : library.data?.materials.length ? (
              library.data.materials.map((material) => {
                const assigned = assignedIds.has(material.id);
                const Icon = typeIcons[material.type];
                return (
                  <article
                    key={material.id}
                    className="context-material-picker__item"
                  >
                    <button
                      className="context-material-card__main"
                      onClick={() => onOpen(material)}
                    >
                      <span className="context-material-card__icon">
                        <Icon size={18} />
                      </span>
                      <span>
                        <strong>{material.title}</strong>
                        <small>
                          {[
                            typeLabels[material.type],
                            material.subject,
                            material.level,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                    </button>
                    <div className="context-material-picker__actions">
                      <button
                        className="button button--quiet"
                        onClick={() => onOpen(material)}
                      >
                        <ExternalLink size={15} /> Otwórz
                      </button>
                      <button
                        className="button button--secondary"
                        disabled={assigned || pendingId === material.id}
                        onClick={() => onAssign(material.id)}
                      >
                        {pendingId === material.id ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : assigned ? (
                          assignedLabel
                        ) : (
                          actionLabel
                        )}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState title="Nie znaleziono materiałów pasujących do filtrów." />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function MaterialPreview({
  material,
  onOpenChange,
}: {
  material: MaterialLibraryItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const target =
    material?.type === "file"
      ? `/api/materials/${material.id}/open`
      : material?.externalUrl;
  return (
    <Dialog.Root open={Boolean(material)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-content--small context-material-preview">
          <div className="dialog-header">
            <div>
              <Dialog.Title>{material?.title}</Dialog.Title>
              <Dialog.Description>
                {material
                  ? [
                      typeLabels[material.type],
                      material.subject,
                      material.level,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Zamknij">
              <X size={18} />
            </Dialog.Close>
          </div>
          {material?.archived && (
            <span className="material-archived-badge">
              <Archive size={13} /> Materiał archiwalny
            </span>
          )}
          {material?.description && <p>{material.description}</p>}
          {material?.type === "text" && (
            <div className="context-material-preview__text">
              {material.textContent}
            </div>
          )}
          {target && (
            <a
              className="button button--primary"
              href={target}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={17} /> Otwórz materiał
            </a>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T | { code: string; message: string };
  if (!response.ok) throw new ClientApiError(response.status, body as never);
  return body as T;
}
