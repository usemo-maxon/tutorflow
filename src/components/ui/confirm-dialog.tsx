"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, X } from "lucide-react";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  tone = "danger",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  tone?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-content--alert">
          <header className="dialog-header">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close
              className="icon-button"
              aria-label="Zamknij"
              disabled={pending}
            >
              <X size={19} />
            </Dialog.Close>
          </header>
          <Dialog.Description>{description}</Dialog.Description>
          <footer className="dialog-footer">
            <Dialog.Close className="button button--quiet" disabled={pending}>
              Anuluj
            </Dialog.Close>
            <button
              className={`button ${tone === "danger" ? "button--danger" : "button--primary"}`}
              disabled={pending}
              onClick={() => void onConfirm()}
            >
              {pending && <LoaderCircle size={18} className="spin" />}
              {confirmLabel}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
