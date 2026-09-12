import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  CircleDollarSign,
} from "lucide-react";
import type { LessonStatus, PaymentStatus } from "@/lib/domain";
import { copy } from "@/lib/copy";

export function LessonStatusBadge({ status }: { status: LessonStatus }) {
  const Icon =
    status === "completed"
      ? CheckCircle2
      : status === "cancelled"
        ? Ban
        : status === "needs_completion"
          ? AlertCircle
          : Clock3;
  return (
    <span className={`status-badge status-badge--${status}`}>
      <Icon size={14} aria-hidden="true" />
      {copy.status[status]}
    </span>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const label =
    status === "paid"
      ? copy.status.paid
      : status === "cancelled"
        ? copy.status.cancelled
        : copy.status.unpaid;
  return (
    <span className={`status-badge status-badge--payment-${status}`}>
      <CircleDollarSign size={14} aria-hidden="true" />
      {label}
    </span>
  );
}
