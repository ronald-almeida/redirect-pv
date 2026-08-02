import { Link } from "@tanstack/react-router";
import { Bell, Globe, Hourglass, Plus, Search } from "lucide-react";

type QuickAction = {
  to: "/admin/slugs" | "/admin/domains";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
};

const ACTIONS: QuickAction[] = [
  { to: "/admin/slugs", label: "Criar link", icon: Plus, primary: true },
  { to: "/admin/slugs", label: "Procurar link", icon: Search },
  { to: "/admin/domains", label: "Adicionar domínio", icon: Globe },
  { to: "/admin/slugs", label: "Links em espera", icon: Hourglass },
];

interface QuickActionsProps {
  onAlerts: () => void;
  alertCount: number;
}

export function QuickActions({ onAlerts, alertCount }: QuickActionsProps) {
  return (
    <nav
      aria-label="Ações rápidas"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
    >
      {ACTIONS.map((a) => (
        <Link
          key={a.label}
          to={a.to}
          className={
            a.primary
              ? "tap flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              : "tap flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-[13px] font-medium transition-colors hover:border-primary/30 hover:bg-secondary"
          }
        >
          <a.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{a.label}</span>
        </Link>
      ))}
      <button
        type="button"
        onClick={onAlerts}
        className="tap relative flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-[13px] font-medium transition-colors hover:border-primary/30 hover:bg-secondary"
      >
        <Bell className="h-4 w-4 shrink-0" />
        <span className="truncate">Ver alertas</span>
        {alertCount > 0 && (
          <span className="ml-0.5 rounded-full bg-destructive px-1.5 text-[10.5px] font-bold tabular-nums text-destructive-foreground">
            {alertCount}
          </span>
        )}
      </button>
    </nav>
  );
}
