"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFinanceMutation } from "@/hooks/use-app-data";
import {
  parseMoneyInput,
  paymentStudentCandidates,
  suggestedAllocations,
  type FinancialOverview,
  type FinancialPaymentMethod,
} from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { useSessionTeacher } from "./app-shell";
import { useAppUi } from "./app-ui-context";

export function RecordPaymentDialog({
  overview,
  defaultStudentId,
  triggerLabel = "Zarejestruj płatność",
  autoOpen = false,
  onAutoOpenConsumed,
}: {
  overview: FinancialOverview;
  defaultStudentId?: string;
  triggerLabel?: string;
  autoOpen?: boolean;
  onAutoOpenConsumed?: () => void;
}) {
  const teacher = useSessionTeacher();
  const mutation = useFinanceMutation(teacher.id);
  const { showToast, showError } = useAppUi();
  const paymentStudents = useMemo(
    () => paymentStudentCandidates(overview),
    [overview],
  );
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState(
    defaultStudentId ?? paymentStudents[0]?.id ?? "",
  );
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<FinancialPaymentMethod>("bank_transfer");
  const [note, setNote] = useState("");
  const [selectedOverride, setSelectedOverride] = useState<Set<string> | null>(
    null,
  );
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  useEffect(() => {
    if (!autoOpen) return;
    const timer = window.setTimeout(() => {
      if (paymentStudents.length) setOpen(true);
      onAutoOpenConsumed?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoOpen, onAutoOpenConsumed, paymentStudents.length]);
  const amountMinor = parseMoneyInput(amount);
  const student = paymentStudents.find((item) => item.id === studentId);
  const charges = useMemo(
    () =>
      overview.openCharges.filter(
        (charge) =>
          charge.studentId === studentId &&
          charge.currency === student?.currency,
      ),
    [overview.openCharges, studentId, student?.currency],
  );

  const selected =
    selectedOverride ??
    new Set(
      amountMinor
        ? suggestedAllocations(amountMinor, charges).map(
            (item) => item.chargeId,
          )
        : [],
    );

  const allocations = amountMinor
    ? suggestedAllocations(
        amountMinor,
        charges.filter((charge) => selected.has(charge.id)),
      )
    : [];
  const allocated = allocations.reduce(
    (sum, item) => sum + item.amountGrosz,
    0,
  );
  const unallocated = Math.max((amountMinor ?? 0) - allocated, 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!student || !amountMinor) return;
    try {
      await mutation.mutateAsync({
        type: "recordPayment",
        studentId,
        amountGrosz: amountMinor,
        currency: student.currency,
        paidAt: `${paidAt}T12:00:00.000Z`,
        paymentMethod: method,
        note: note || undefined,
        allocations,
        idempotencyKey,
      });
      showToast({ message: "Płatność została zapisana i przypisana." });
      setOpen(false);
      setAmount("");
      setNote("");
      setIdempotencyKey(crypto.randomUUID());
    } catch (error) {
      showError(error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="button button--primary"
          disabled={!paymentStudents.length}
        >
          {triggerLabel}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content dialog-content--medium finance-dialog"
          aria-describedby="record-payment-description"
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title>Zarejestruj płatność</Dialog.Title>
              <Dialog.Description id="record-payment-description">
                Zapisz faktycznie otrzymane środki i sprawdź ich przypisanie.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Zamknij">
              <X size={19} />
            </Dialog.Close>
          </header>
          <form onSubmit={submit} className="finance-form">
            <label>
              <span>Uczeń *</span>
              <select
                value={studentId}
                onChange={(event) => {
                  setStudentId(event.target.value);
                  setSelectedOverride(null);
                }}
                required
              >
                {paymentStudents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.status === "archived" ? " (Archiwalny)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="finance-form-grid">
              <label>
                <span>Kwota *</span>
                <div className="money-input">
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setSelectedOverride(null);
                    }}
                    placeholder="160,00"
                    required
                    aria-invalid={amount.length > 0 && !amountMinor}
                  />
                  <span>
                    {student?.currency ?? overview.workspace.currency}
                  </span>
                </div>
              </label>
              <label>
                <span>Data *</span>
                <input
                  type="date"
                  value={paidAt}
                  onChange={(event) => setPaidAt(event.target.value)}
                  required
                />
              </label>
            </div>
            <label>
              <span>Metoda</span>
              <select
                value={method}
                onChange={(event) =>
                  setMethod(event.target.value as FinancialPaymentMethod)
                }
              >
                <option value="bank_transfer">Przelew</option>
                <option value="cash">Gotówka</option>
                <option value="card_external">Karta (poza easy4tutor)</option>
                <option value="other">Inna</option>
              </select>
            </label>
            <fieldset className="allocation-picker">
              <legend>Przypisz do</legend>
              {charges.length ? (
                charges.map((charge) => {
                  const proposed =
                    allocations.find((item) => item.chargeId === charge.id)
                      ?.amountGrosz ?? 0;
                  return (
                    <label key={charge.id} className="allocation-row">
                      <input
                        type="checkbox"
                        checked={selected.has(charge.id)}
                        onChange={(event) =>
                          setSelectedOverride(() => {
                            const next = new Set(selected);
                            if (event.target.checked) next.add(charge.id);
                            else next.delete(charge.id);
                            return next;
                          })
                        }
                      />
                      <span>
                        <strong>{charge.description}</strong>
                        <small>
                          {charge.overdue
                            ? "Po terminie"
                            : charge.dueAt
                              ? "Do zapłaty"
                              : "Bez terminu"}
                        </small>
                      </span>
                      <strong>
                        {formatMoney({
                          amount: proposed || charge.outstanding,
                          currency: charge.currency as "PLN",
                        })}
                      </strong>
                    </label>
                  );
                })
              ) : (
                <p className="form-hint">
                  Brak otwartych pozycji. Cała kwota pozostanie nieprzypisana.
                </p>
              )}
            </fieldset>
            {amountMinor ? (
              <div className="allocation-summary" aria-live="polite">
                <span>
                  Przypisano{" "}
                  <strong>
                    {formatMoney({
                      amount: allocated,
                      currency: (student?.currency ??
                        overview.workspace.currency) as "PLN",
                    })}
                  </strong>
                </span>
                <span>
                  Nieprzypisane{" "}
                  <strong>
                    {formatMoney({
                      amount: unallocated,
                      currency: (student?.currency ??
                        overview.workspace.currency) as "PLN",
                    })}
                  </strong>
                </span>
              </div>
            ) : null}
            <label>
              <span>Notatka (opcjonalnie)</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                placeholder="np. Przelew za wrzesień"
              />
            </label>
            <footer className="dialog-actions">
              <Dialog.Close className="button button--quiet" type="button">
                Anuluj
              </Dialog.Close>
              <button
                className="button button--primary"
                type="submit"
                disabled={!student || !amountMinor || mutation.isPending}
              >
                {mutation.isPending && (
                  <LoaderCircle className="spin" size={17} />
                )}
                Zapisz płatność
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CreatePackageDialog({
  overview,
  defaultStudentId,
  autoOpen = false,
  onAutoOpenConsumed,
}: {
  overview: FinancialOverview;
  defaultStudentId?: string;
  autoOpen?: boolean;
  onAutoOpenConsumed?: () => void;
}) {
  const teacher = useSessionTeacher();
  const mutation = useFinanceMutation(teacher.id);
  const { showToast, showError } = useAppUi();
  const activeStudents = useMemo(
    () => overview.students.filter((student) => student.status === "active"),
    [overview.students],
  );
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState(
    defaultStudentId ?? activeStudents[0]?.id ?? "",
  );
  const [name, setName] = useState("Pakiet 8 zajęć");
  const [lessons, setLessons] = useState("8");
  const [price, setPrice] = useState("640");
  const [purchasedAt, setPurchasedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [expiresAt, setExpiresAt] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  useEffect(() => {
    if (!autoOpen) return;
    const timer = window.setTimeout(() => {
      if (activeStudents.length) setOpen(true);
      onAutoOpenConsumed?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeStudents.length, autoOpen, onAutoOpenConsumed]);
  const student = activeStudents.find((item) => item.id === studentId);
  const invalidDates = Boolean(expiresAt && expiresAt < purchasedAt);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const priceGrosz = parseMoneyInput(price);
    const totalLessons = Number(lessons);
    if (
      !student ||
      !name.trim() ||
      priceGrosz === null ||
      !Number.isInteger(totalLessons) ||
      totalLessons <= 0 ||
      invalidDates
    )
      return;
    try {
      await mutation.mutateAsync({
        type: "createPackage",
        studentId,
        name,
        totalLessons,
        priceGrosz,
        currency: student.currency,
        purchasedAt: `${purchasedAt}T12:00:00.000Z`,
        expiresAt: expiresAt ? `${expiresAt}T23:59:59.000Z` : null,
        idempotencyKey,
      });
      showToast({
        message:
          "Pakiet został utworzony. Płatność nadal trzeba zarejestrować.",
      });
      setOpen(false);
      setIdempotencyKey(crypto.randomUUID());
    } catch (error) {
      showError(error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="button button--secondary"
          disabled={!activeStudents.length}
        >
          Utwórz pakiet
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content dialog-content--medium finance-dialog"
          aria-describedby="package-description"
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title>Utwórz pakiet</Dialog.Title>
              <Dialog.Description id="package-description">
                Pakiet tworzy uprawnienie do zajęć, ale nie oznacza otrzymania
                pieniędzy.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Zamknij">
              <X size={19} />
            </Dialog.Close>
          </header>
          <form onSubmit={submit} className="finance-form">
            <label>
              <span>Uczeń *</span>
              <select
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
              >
                {activeStudents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Nazwa *</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={180}
              />
            </label>
            <div className="finance-form-grid">
              <label>
                <span>Liczba zajęć *</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={lessons}
                  onChange={(event) => setLessons(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Cena *</span>
                <div className="money-input">
                  <input
                    inputMode="decimal"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    required
                  />
                  <span>
                    {student?.currency ?? overview.workspace.currency}
                  </span>
                </div>
              </label>
            </div>
            <div className="finance-form-grid">
              <label>
                <span>Data zakupu *</span>
                <input
                  type="date"
                  value={purchasedAt}
                  onChange={(event) => setPurchasedAt(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Ważny do</span>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  min={purchasedAt}
                  aria-invalid={invalidDates}
                />
                {invalidDates && (
                  <small className="field-error">
                    Data ważności nie może poprzedzać daty zakupu.
                  </small>
                )}
              </label>
            </div>
            <footer className="dialog-actions">
              <Dialog.Close className="button button--quiet" type="button">
                Anuluj
              </Dialog.Close>
              <button
                className="button button--primary"
                type="submit"
                disabled={
                  mutation.isPending ||
                  !student ||
                  !name.trim() ||
                  parseMoneyInput(price) === null ||
                  !Number.isInteger(Number(lessons)) ||
                  Number(lessons) <= 0 ||
                  invalidDates
                }
              >
                {mutation.isPending && (
                  <LoaderCircle className="spin" size={17} />
                )}
                Utwórz pakiet
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
