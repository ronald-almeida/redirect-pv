import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LinkIcon,
  BarChart3,
  Activity,
  ScrollText,
  Settings,
  Search,
  ChevronDown,
  ChevronUp,
  LogOut,
  ShieldCheck,
  Calendar as CalendarIcon,
  Sun,
  Moon,
  Check,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DateRange as RDPRange } from "react-day-picker";

type NavItem = {
  to: "/admin" | "/admin/analytics" | "/admin/latency" | "/admin/events" | "/admin/settings";
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: string;
};

const NAV: NavItem[] = [
  { to: "/admin", label: "Links", icon: LinkIcon },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/latency", label: "Latência", icon: Activity },
  { to: "/admin/events", label: "Eventos", icon: ScrollText },
  { to: "/admin/settings", label: "Configurações", icon: Settings },
];

export type AdminPeriod = "today" | "yesterday" | "7d" | "30d" | "custom";

interface AdminShellProps {
  children: React.ReactNode;
  search?: string;
  onSearch?: (v: string) => void;
  period?: AdminPeriod;
  onPeriod?: (p: AdminPeriod) => void;
  customStart?: string; // YYYY-MM-DD
  customEnd?: string;
  onCustomRange?: (startYmd: string, endYmd: string) => void;
  rightSlot?: React.ReactNode;
}

const PERIOD_LABEL: Record<AdminPeriod, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  custom: "Personalizado",
};

const PERIOD_OPTIONS: AdminPeriod[] = ["today", "yesterday", "7d", "30d", "custom"];

function fmtBrDate(ymd?: string) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AdminShell({
  children,
  period,
  onPeriod,
  customStart,
  customEnd,
  onCustomRange,
  rightSlot,
}: AdminShellProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string>("");
  const [light, setLight] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const initials = (email || "AD").slice(0, 2).toUpperCase();
  const displayName = email ? email.split("@")[0] : "Administrador";

  const rangeSel = useMemo<RDPRange | undefined>(() => {
    if (period !== "custom") return undefined;
    const from = customStart ? new Date(`${customStart}T12:00:00`) : undefined;
    const to = customEnd ? new Date(`${customEnd}T12:00:00`) : undefined;
    return { from, to };
  }, [period, customStart, customEnd]);

  const periodButtonLabel =
    period === "custom" && customStart && customEnd
      ? `${fmtBrDate(customStart)} – ${fmtBrDate(customEnd)}`
      : PERIOD_LABEL[period ?? "7d"];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-[68px] items-center gap-2.5 px-5">
          <div className="relative flex h-9 w-9 items-center justify-center">
            <div className="absolute inset-0 rounded-[10px] bg-primary/15 blur-md" />
            <div className="relative flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-primary/90 to-primary/60 text-primary-foreground shadow-[0_4px_16px_-4px_rgba(163,230,53,0.55)]">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
            </div>
          </div>
          <span className="text-[16px] font-semibold tracking-tight">CloakPanel</span>
        </div>

        <nav className="flex-1 px-3 pt-2 space-y-1">
          {NAV.map((item) => {
            const active = item.to === "/admin" ? pathname === "/admin" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-all",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
                style={active ? { boxShadow: "0 0 0 1px rgba(163,230,53,0.18), 0 0 22px -8px rgba(163,230,53,0.55) inset" } : undefined}
              >
                {active && (
                  <span className="absolute -left-3 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_12px_rgba(163,230,53,0.8)]" />
                )}
                <item.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={active ? 2.25 : 2} />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="group flex w-full items-center gap-2.5 rounded-[10px] border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2 outline-none transition-colors hover:bg-sidebar-accent">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground border border-border">
                {initials}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-[12.5px] font-semibold">{displayName}</div>
                <div className="truncate text-[10.5px] text-muted-foreground">CloakPanel</div>
              </div>
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="text-xs">
                <div className="font-semibold truncate">{email || displayName}</div>
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
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border bg-background/85 backdrop-blur px-4 md:px-8">
          <button className="md:hidden flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary">
            <Search className="h-4 w-4" />
          </button>

          <div className="ml-auto flex items-center gap-2">
            {onPeriod && (
              <Popover open={periodOpen} onOpenChange={setPeriodOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-[12.5px] font-medium outline-none transition-all",
                      "border-border hover:border-primary/40 hover:bg-secondary hover:shadow-[0_0_0_4px_rgba(163,230,53,0.06)]",
                    )}
                  >
                    <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                    <span className="tabular-nums">{periodButtonLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-0 overflow-hidden">
                  <div className="flex">
                    <div className="w-44 border-r border-border py-2">
                      {PERIOD_OPTIONS.map((p) => {
                        const active = period === p;
                        return (
                          <button
                            key={p}
                            onClick={() => {
                              onPeriod(p);
                              if (p !== "custom") setPeriodOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] transition-colors",
                              active ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-secondary",
                            )}
                          >
                            {PERIOD_LABEL[p]}
                            {active && <Check className="h-3.5 w-3.5" />}
                          </button>
                        );
                      })}
                    </div>
                    {period === "custom" && (
                      <div className="p-2">
                        <Calendar
                          mode="range"
                          numberOfMonths={2}
                          selected={rangeSel}
                          onSelect={(r) => {
                            if (r?.from && r?.to && onCustomRange) {
                              onCustomRange(toYmd(r.from), toYmd(r.to));
                            }
                          }}
                          className={cn("pointer-events-auto")}
                        />
                        <div className="flex items-center justify-end gap-2 px-2 pb-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPeriodOpen(false)}
                          >
                            Fechar
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setPeriodOpen(false)}
                            disabled={!customStart || !customEnd}
                          >
                            Aplicar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            <button
              onClick={() => setLight((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card hover:bg-secondary"
              aria-label="Tema"
            >
              {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
            </button>

            {rightSlot}

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-full border border-border bg-card pl-1 pr-3 py-1 outline-none hover:bg-secondary">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">
                  {initials}
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <div className="text-[12px] font-semibold">{displayName}</div>
                  <div className="text-[10px] text-muted-foreground">Administrador</div>
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">
                  <div className="font-semibold truncate">{email || displayName}</div>
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
          </div>
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
                    active ? "bg-primary/10 text-primary" : "text-sidebar-foreground",
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
