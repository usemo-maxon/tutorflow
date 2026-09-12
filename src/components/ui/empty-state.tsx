import type { ReactNode } from "react";

export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-rule" aria-hidden="true" />
      <p>{title}</p>
      {action}
    </div>
  );
}
