"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
import type { StudentGroup } from "@/lib/domain";
import { useSessionTeacher } from "./app-shell";
import { useAppUi } from "./app-ui-context";

export function GroupMembersDialog({
  group,
  open,
  onOpenChange,
}: {
  group: StudentGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const teacher = useSessionTeacher();
  const { data } = useAppData(teacher.id);
  const mutation = useAppMutation(teacher.id);
  const { showToast, showError } = useAppUi();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const activeIds = useMemo(
    () =>
      new Set(
        group.members
          .filter((member) => member.status === "active")
          .map((member) => member.studentId),
      ),
    [group],
  );
  const available = useMemo(
    () =>
      (data?.students ?? []).filter(
        (student) =>
          student.status === "active" &&
          !activeIds.has(student.id) &&
          [student.name, student.email, student.phone]
            .join(" ")
            .toLocaleLowerCase("pl")
            .includes(search.toLocaleLowerCase("pl")),
      ),
    [data, activeIds, search],
  );

  async function add() {
    if (!selected.length) return;
    try {
      await mutation.mutateAsync({
        type: "addGroupMembers",
        groupId: group.id,
        studentIds: selected,
      });
      onOpenChange(false);
      showToast({
        message:
          selected.length === 1
            ? "Uczeń został dodany do grupy."
            : `Dodano ${selected.length} uczniów do grupy.`,
      });
    } catch (error) {
      showError(error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content dialog-content--medium"
          aria-describedby="members-description"
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title>Dodaj uczniów</Dialog.Title>
              <Dialog.Description id="members-description">
                Wybierz aktywnych uczniów, których chcesz dodać do {group.name}.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Zamknij">
              <X size={20} />
            </Dialog.Close>
          </header>
          <div className="dialog-scroll form-stack">
            <label className="search-field">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Szukaj uczniów</span>
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Szukaj uczniów"
              />
            </label>
            <div className="member-picker">
              {available.length ? (
                available.map((student) => (
                  <label key={student.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(student.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, student.id]
                            : current.filter((id) => id !== student.id),
                        )
                      }
                    />
                    <span className="avatar" aria-hidden="true">
                      {student.name
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span>
                      <strong>{student.name}</strong>
                      <small>
                        {[student.subject, student.level]
                          .filter(Boolean)
                          .join(" · ") || "Profil do uzupełnienia"}
                      </small>
                    </span>
                  </label>
                ))
              ) : (
                <p className="empty-inline">Brak uczniów do dodania.</p>
              )}
            </div>
          </div>
          <footer className="dialog-footer">
            <Dialog.Close className="button button--quiet">Anuluj</Dialog.Close>
            <button
              className="button button--primary"
              disabled={!selected.length || mutation.isPending}
              onClick={() => void add()}
            >
              {mutation.isPending && (
                <LoaderCircle size={18} className="spin" />
              )}
              Dodaj {selected.length || ""}{" "}
              {selected.length === 1 ? "ucznia" : "uczniów"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
