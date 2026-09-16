"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
import { useSessionTeacher } from "./app-shell";
import { useAppUi } from "./app-ui-context";

export function StudentGroupDialog({
  studentId,
  open,
  onOpenChange,
}: {
  studentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const teacher = useSessionTeacher();
  const { data } = useAppData(teacher.id);
  const mutation = useAppMutation(teacher.id);
  const { showToast, showError } = useAppUi();
  const [groupId, setGroupId] = useState("");
  const student = data?.students.find((item) => item.id === studentId);
  const available =
    data?.groups.filter(
      (group) =>
        group.status === "active" && !student?.groupIds.includes(group.id),
    ) ?? [];
  async function add() {
    if (!groupId) return;
    try {
      await mutation.mutateAsync({
        type: "addGroupMembers",
        groupId,
        studentIds: [studentId],
      });
      onOpenChange(false);
      setGroupId("");
      showToast({ message: "Uczeń został dodany do grupy." });
    } catch (error) {
      showError(error);
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content dialog-content--alert"
          aria-describedby="student-group-description"
        >
          <header className="dialog-header">
            <Dialog.Title>Dodaj do grupy</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Zamknij">
              <X size={19} />
            </Dialog.Close>
          </header>
          <Dialog.Description id="student-group-description">
            Wybierz aktywną grupę dla {student?.name ?? "ucznia"}.
          </Dialog.Description>
          {available.length ? (
            <label className="field">
              <span>Grupa</span>
              <select
                autoFocus
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
              >
                <option value="">Wybierz grupę</option>
                {available.map((group) => (
                  <option value={group.id} key={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="empty-inline">
              Brak innych aktywnych grup. Najpierw utwórz grupę w widoku Grup.
            </p>
          )}
          <footer className="dialog-footer">
            <Dialog.Close className="button button--quiet">Anuluj</Dialog.Close>
            <button
              className="button button--primary"
              disabled={!groupId || mutation.isPending}
              onClick={() => void add()}
            >
              {mutation.isPending && (
                <LoaderCircle size={18} className="spin" />
              )}
              Dodaj do grupy
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
