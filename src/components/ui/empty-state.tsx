import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-rule" aria-hidden="true" />
      <p>{title}</p>
      {description && <small>{description}</small>}
      {action}
    </div>
  );
}
