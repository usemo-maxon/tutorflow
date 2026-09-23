"use client";

import {
  CalendarPlus,
  Clock3,
  PackagePlus,
  Plus,
  ReceiptText,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  GLOBAL_CREATE_GROUPS,
  type GlobalCreateAction,
} from "@/lib/global-create";

const actionIcons: Record<GlobalCreateAction, LucideIcon> = {
  lesson: CalendarPlus,
  student: UserPlus,
  group: UsersRound,
  block: Clock3,
  payment: ReceiptText,
  package: PackagePlus,
};

export function GlobalCreateMenu({
  className,
  disabled = false,
  iconOnly = false,
  placement = "start",
  onAction,
}: {
  className: string;
  disabled?: boolean;
  iconOnly?: boolean;
  placement?: "start" | "end";
  onAction: (action: GlobalCreateAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const restoreFocus = useRef(true);
  const menuId = useId();

  function closeMenu(returnFocus = true) {
    restoreFocus.current = returnFocus;
    setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      if (wasOpen.current && restoreFocus.current) {
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
      wasOpen.current = false;
      return;
    }

    wasOpen.current = true;
    restoreFocus.current = true;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        closeMenu(false);
        return;
      }
      const menuWidth = Math.min(276, window.innerWidth - 24);
      const menuHeight = menuRef.current?.offsetHeight ?? 376;
      const left = Math.min(
        window.innerWidth - menuWidth - 12,
        Math.max(12, placement === "end" ? rect.right - menuWidth : rect.left),
      );
      const roomBelow = window.innerHeight - rect.bottom - 12;
      const top =
        roomBelow >= Math.min(menuHeight, 300)
          ? rect.bottom + 8
          : Math.max(12, rect.top - menuHeight - 8);
      setPosition({ top, left });
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      closeMenu();
    }

    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
    }

    updatePosition();
    const focusTimer = window.setTimeout(() => {
      updatePosition();
      menuRef.current
        ?.querySelector<HTMLButtonElement>("[role='menuitem']")
        ?.focus();
    }, 0);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, placement]);

  function selectAction(action: GlobalCreateAction) {
    restoreFocus.current = false;
    triggerRef.current?.focus();
    setOpen(false);
    onAction(action);
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']",
      ),
    );
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  const readOnlyLabel = "Dodawanie niedostępne — konto tylko do odczytu";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-label={disabled ? readOnlyLabel : iconOnly ? "Dodaj" : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={disabled ? readOnlyLabel : "Dodaj"}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <Plus size={iconOnly ? 21 : 18} aria-hidden="true" />
        {!iconOnly && <span>Dodaj</span>}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="global-create-menu"
            role="menu"
            aria-label="Dodaj w easy4tutor"
            onKeyDown={onMenuKeyDown}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? "visible" : "hidden",
            }}
          >
            {GLOBAL_CREATE_GROUPS.map((group) => {
              const groupLabelId = `${menuId}-${group.id}`;
              return (
                <section
                  className="global-create-menu__group"
                  role="group"
                  aria-labelledby={groupLabelId}
                  key={group.id}
                >
                  <p id={groupLabelId}>{group.label}</p>
                  {group.actions.map((action) => {
                    const Icon = actionIcons[action.id];
                    return (
                      <button
                        type="button"
                        role="menuitem"
                        key={action.id}
                        onClick={() => selectAction(action.id)}
                      >
                        <span aria-hidden="true">
                          <Icon size={18} />
                        </span>
                        {action.label}
                      </button>
                    );
                  })}
                </section>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
