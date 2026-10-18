import {
  Activity,
  ArrowLeft,
  CreditCard,
  Headphones,
  LayoutDashboard,
  ListChecks,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  adminRoleLabel,
  hasAdminPermission,
  type AdminPermission,
  type PlatformAdminRole,
} from "@/lib/admin";
import styles from "./admin.module.css";

const navigation: Array<{
  href: string;
  label: string;
  permission: AdminPermission;
  icon: typeof Activity;
}> = [
  { href: "/app/admin", label: "Przegląd", permission: "overview.read", icon: LayoutDashboard },
  { href: "/app/admin/users", label: "Użytkownicy", permission: "users.read", icon: Users },
  { href: "/app/admin/subscriptions", label: "Subskrypcje", permission: "subscriptions.read", icon: CreditCard },
  { href: "/app/admin/payments", label: "Płatności", permission: "payments.read", icon: ReceiptText },
  { href: "/app/admin/support", label: "Wsparcie", permission: "support.read", icon: Headphones },
  { href: "/app/admin/system", label: "System", permission: "system.read", icon: Activity },
  { href: "/app/admin/audit", label: "Dziennik audytu", permission: "audit.read", icon: ListChecks },
  { href: "/app/admin/settings", label: "Ustawienia", permission: "settings.read", icon: Settings },
];

export function AdminShell({
  role,
  children,
}: {
  role: PlatformAdminRole;
  children: ReactNode;
}) {
  return (
    <section className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Administracja platformą">
        <div className={styles.identity}>
          <span className={styles.mark}><ShieldCheck size={19} /></span>
          <div><strong>Easy4Tutor</strong><span>Centrum operacyjne</span></div>
        </div>
        <nav className={styles.navigation}>
          {navigation
            .filter((item) => hasAdminPermission(role, item.permission))
            .map((item) => {
              const Icon = item.icon;
              return <Link href={item.href} key={item.href}><Icon size={17} /><span>{item.label}</span></Link>;
            })}
        </nav>
        <div className={styles.sidebarFooter}>
          <span className={styles.role}>{adminRoleLabel(role)}</span>
          <Link href="/app"><ArrowLeft size={15} /> Wróć do aplikacji</Link>
        </div>
      </aside>
      <div className={styles.workspace}>
        <div className={styles.statusRail} role="status">
          <span><i /> Dostęp administracyjny aktywny</span>
          <span>Operacje wrażliwe są rejestrowane</span>
        </div>
        <main className={styles.main}>{children}</main>
      </div>
    </section>
  );
}

