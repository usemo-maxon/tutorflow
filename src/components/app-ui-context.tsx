"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { AppError, Student } from "@/lib/domain";
import type {
  LessonAfterCreate,
  StudentComposerContext,
} from "@/lib/composer-context";

export interface LessonComposerPreset {
  studentIds?: string[];
  date?: string;
  time?: string;
  durationMinutes?: number;
  afterCreate?: LessonAfterCreate;
}

interface ToastState {
  id: string;
  message: string;
  tone?: "success" | "error" | "info";
  actionLabel?: string;
  onAction?: () => void;
}

interface AppUiValue {
  lessonComposer: LessonComposerPreset | null;
  studentComposerOpen: boolean;
  studentComposerContext: StudentComposerContext;
  editingStudent: Student | null;
  toast: ToastState | null;
  openLessonComposer: (preset?: LessonComposerPreset) => void;
  closeLessonComposer: () => void;
  openStudentComposer: (
    student?: Student,
    context?: StudentComposerContext,
  ) => void;
  dismissToast: () => void;
  restoreComposerFocus: (kind: "lesson" | "student") => void;
  closeStudentComposer: () => void;
  showToast: (toast: Omit<ToastState, "id">) => void;
  showError: (error: unknown) => void;
}

const AppUiContext = createContext<AppUiValue | null>(null);

export function AppUiProvider({ children }: { children: ReactNode }) {
  const [lessonComposer, setLessonComposer] =
    useState<LessonComposerPreset | null>(null);
  const [studentComposerOpen, setStudentComposerOpen] = useState(false);
  const [studentComposerContext, setStudentComposerContext] =
    useState<StudentComposerContext>("default");
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const composerTriggers = useRef<
    Partial<Record<"lesson" | "student", HTMLElement>>
  >({});

  const showToast = useCallback((next: Omit<ToastState, "id">) => {
    const id = crypto.randomUUID();
    setToast({ ...next, id });
    if (next.tone === "error" || next.onAction) return;
    window.setTimeout(
      () => setToast((current) => (current?.id === id ? null : current)),
      5_000,
    );
  }, []);
  const showError = useCallback(
    (error: unknown) => {
      const data =
        error && typeof error === "object" && "data" in error
          ? (error as { data: AppError }).data
          : undefined;
      showToast({
        message:
          data?.message ?? "Brak połączenia. Sprawdź sieć i spróbuj ponownie.",
        tone: "error",
      });
    },
    [showToast],
  );
  const value = useMemo<AppUiValue>(
    () => ({
      lessonComposer,
      studentComposerOpen,
      studentComposerContext,
      editingStudent,
      dismissToast: () => setToast(null),
      restoreComposerFocus: (kind) => {
        const trigger = composerTriggers.current[kind];
        if (trigger?.isConnected) trigger.focus();
      },
      toast,
      openLessonComposer: (preset = {}) => {
        composerTriggers.current.lesson = document.activeElement as HTMLElement;
        setLessonComposer(preset);
      },
      closeLessonComposer: () => setLessonComposer(null),
      openStudentComposer: (student, context = "default") => {
        composerTriggers.current.student =
          document.activeElement as HTMLElement;
        setEditingStudent(student ?? null);
        setStudentComposerContext(context);
        setStudentComposerOpen(true);
      },
      closeStudentComposer: () => {
        setStudentComposerOpen(false);
        setStudentComposerContext("default");
      },
      showToast,
      showError,
    }),
    [
      lessonComposer,
      studentComposerOpen,
      studentComposerContext,
      editingStudent,
      toast,
      showToast,
      showError,
    ],
  );

  return (
    <AppUiContext.Provider value={value}>{children}</AppUiContext.Provider>
  );
}

export function useAppUi() {
  const context = useContext(AppUiContext);
  if (!context) throw new Error("useAppUi must be used inside AppUiProvider");
  return context;
}
