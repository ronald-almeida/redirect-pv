import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LinkIcon,
  BarChart3,
  Activity,
  ScrollText,
  Settings,
  Search,
  ChevronDown,
  LogOut,
  Command,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NavItem = {
  to: "/admin" | "/admin/analytics" | "/admin/latency" | "/admin/events" | "/admin/settings";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { to: "/admin", label: "Links", icon: LinkIcon },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/latency", label: "Latência", icon: Activity },
  { to: "/admin/events", label: "Eventos", icon: ScrollText },
  { to: "/admin/settings", label: "Configurações", icon: Settings },
];

const TITLES: Record<string, string> = {
  "/admin": "Links",
  "/admin/analytics": "Analytics",
  "/admin/latency": "Latência",
  "/admin/events": "Eventos",
  "/admin/settings": "Configurações",
};

export type AdminPeriod = "24h" | "7d" | "30d" | "90d";

interface AdminShellProps {
  children: React.ReactNode;
  search?: string;
  onSearch?: (v: string) => void;
  period?: AdminPeriod;
  onPeriod?: (p: AdminPeriod) => void;
  rightSlot?: React.ReactNode;
}

export function AdminShell({
  children,
  search,
  onSearch,
  period,
  onPeriod,
  rightSlot,
}: AdminShellProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const isProd = typeof window !== "undefined" && !/preview|localhost/.test(window.location.host);
  const title = TITLES[pathname] ?? "Painel";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex w-[232px] shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex h-14 items-center gap-2.5 px-5 border-b border-border">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
            <Command className="h-3.5 w-3.5" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">CloakPanel</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            Operação
          </div>
          {NAV.map((item) => {
            const active = item.to === "/admin" ? pathname === "/admin" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-3 border-t border-border">
          <div className="rounded-md bg-background/40 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", isProd ? "bg-[--success] animate-pulse" : "bg-warning")} />
              {isProd ? "Production" : "Preview"}
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground/70">
              {typeof window !== "undefined" ? window.location.host : ""}
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 backdrop-blur px-4 md:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-[15px] font-semibold tracking-tight truncate">{title}</h1>
            <span className={cn(
              "hidden sm:inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              isProd ? "border-[--success]/30 text-[--success] bg-[--success]/8" : "border-warning/30 text-warning bg-warning/8",
            )}>
              {isProd ? "live" : "preview"}
            </span>
          </div>

          {/* Search */}
          {onSearch && (
            <div className="relative ml-auto hidden md:block w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search ?? ""}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Buscar slug, nome…"
                className="h-8 w-full rounded-md border border-border bg-secondary pl-8 pr-2 text-[12.5px] outline-none focus:border-accent"
              />
            </div>
          )}

          {!onSearch && <div className="ml-auto" />}

          {onPeriod && (
            <div className="hidden sm:inline-flex items-center rounded-md border border-border bg-secondary p-0.5">
              {(["24h", "7d", "30d", "90d"] as AdminPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onPeriod(p)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium rounded-[5px] transition-colors",
                    period === p ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {rightSlot}

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-secondary outline-none">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 border border-border text-[11px] font-semibold">
                {(email[0] || "A").toUpperCase()}
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">
                <div className="font-semibold truncate">{email || "Administrador"}</div>
                <div className="text-muted-foreground font-normal">Operador</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/admin/settings">
                  <Settings className="h-3.5 w-3.5" />
                  Configurações
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                <LogOut className="h-3.5 w-3.5" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Mobile nav */}
        <nav className="md:hidden border-b border-border bg-sidebar overflow-x-auto">
          <div className="flex gap-1 px-3 py-2">
            {NAV.map((item) => {
              const active = item.to === "/admin" ? pathname === "/admin" : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium",
                    active ? "bg-sidebar-accent text-foreground" : "text-sidebar-foreground",
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
