import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./admin.module.css";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return <header className={styles.pageHeader}><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions}</header>;
}

export function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return <article className={styles.metric}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return <section className={styles.panel}><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div></header>{children}</section>;
}

export function DataTable({ children, label }: { children: ReactNode; label: string }) {
  return <div className={styles.tableScroll}><table className={styles.table} aria-label={label}>{children}</table></div>;
}

export function EmptyRows({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return <tbody><tr><td className={styles.empty} colSpan={colSpan}>{children}</td></tr></tbody>;
}

export function StatusPill({ tone = "neutral", children }: { tone?: "good" | "warning" | "danger" | "neutral" | "info"; children: ReactNode }) {
  return <span className={`${styles.pill} ${styles[`pill_${tone}`]}`}>{children}</span>;
}

export function AdminFilters({
  query,
  children,
}: {
  query?: string;
  children?: ReactNode;
}) {
  return <form className={styles.filters}><label><Search size={16} /><span className="sr-only">Szukaj</span><input name="q" defaultValue={query} placeholder="E-mail lub UUID" /></label>{children}<button type="submit">Filtruj</button></form>;
}

export function Pagination({
  page,
  hasNext,
  path,
  query = {},
}: {
  page: number;
  hasNext: boolean;
  path: string;
  query?: Record<string, string | undefined>;
}) {
  const href = (target: number) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => value && params.set(key, value));
    params.set("page", String(target));
    return `${path}?${params.toString()}`;
  };
  return <nav className={styles.pagination} aria-label="Stronicowanie"><Link aria-disabled={page <= 1} href={page <= 1 ? href(1) : href(page - 1)}><ChevronLeft size={16} /> Poprzednia</Link><span>Strona {page}</span><Link aria-disabled={!hasNext} href={hasNext ? href(page + 1) : href(page)} >Następna <ChevronRight size={16} /></Link></nav>;
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(value));
}

export function formatMoney(grosz: number, currency = "PLN") {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(grosz / 100);
}

