import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  LinkIcon,
  BarChart3,
  Activity,
  ScrollText,
  Globe,
  Settings,
  ChevronDown,
  ChevronUp,
  LogOut,
  MoreHorizontal,
  Calendar as CalendarIcon,
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

type NavTo =
  | "/admin"
  | "/admin/slugs"
  | "/admin/analytics"
  | "/admin/latency"
  | "/admin/events"
  | "/admin/domains"
  | "/admin/settings";

type NavItem = {
  to: NavTo;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const NAV: NavItem[] = [
  { to: "/admin", label: "Visão Geral", shortLabel: "Geral", icon: LayoutDashboard },
  { to: "/admin/slugs", label: "Links", shortLabel: "Links", icon: LinkIcon },
  { to: "/admin/analytics", label: "Analytics", shortLabel: "Analytics", icon: BarChart3 },
  { to: "/admin/latency", label: "Latência", shortLabel: "Latência", icon: Activity },
  { to: "/admin/domains", label: "Domínios", shortLabel: "Domínios", icon: Globe },
  { to: "/admin/events", label: "Eventos", shortLabel: "Eventos", icon: ScrollText },
  { to: "/admin/settings", label: "Configurações", shortLabel: "Config.", icon: Settings },
];

/** Itens fixos na barra inferior do celular; o resto entra em "Mais". */
const MOBILE_PRIMARY = NAV.slice(0, 4);
const MOBILE_OVERFLOW = NAV.slice(4);

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

const PERIOD_SHORT: Record<AdminPeriod, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "7 dias",
  "30d": "30 dias",
  custom: "Período",
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

function isActive(pathname: string, to: NavTo) {
  return to === "/admin" ? pathname === "/admin" : pathname.startsWith(to);
}

function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-[10px] bg-primary/20 blur-md" />
      <img
        src="/big-cloak-icon.png"
        alt="Big Cloak"
        width={size}
        height={size}
        className="relative h-full w-full rounded-[10px] object-cover"
      />
    </div>
  );
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
  const [periodOpen, setPeriodOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const initials = (email || "BC").slice(0, 2).toUpperCase();
  const displayName = email ? email.split("@")[0] : "Operador";

  const rangeSel = useMemo<RDPRange | undefined>(() => {
    if (period !== "custom") return undefined;
    const from = customStart ? new Date(`${customStart}T12:00:00`) : undefined;
    const to = customEnd ? new Date(`${customEnd}T12:00:00`) : undefined;
    return { from, to };
  }, [period, customStart, customEnd]);

  const periodButtonLabel =
    period === "custom" && customStart && customEnd
      ? `${fmtBrDate(customStart)} – ${fmtBrDate(customEnd)}`
      : PERIOD_LABEL[period ?? "today"];

  const currentTitle = NAV.find((n) => isActive(pathname, n.to))?.label ?? "Big Cloak";
  const overflowActive = MOBILE_OVERFLOW.some((n) => isActive(pathname, n.to));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ── Sidebar (desktop) ─────────────────────────────────────────── */}
      <aside className="hidden md:flex w-[236px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-[68px] items-center gap-2.5 px-5">
          <BrandMark />
          <div className="min-w-0 leading-tight">
            <div className="text-[15.5px] font-extrabold tracking-tight">Big Cloak</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Redirect Engine
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 pt-2">
          {NAV.map((item) => {
            const active = isActive(pathname, item.to);
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
              >
                {active && (
                  <span className="absolute -left-3 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                  strokeWidth={active ? 2.25 : 2}
                />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="group flex w-full items-center gap-2.5 rounded-[10px] border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2 outline-none transition-colors hover:bg-sidebar-accent">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[11px] font-semibold text-foreground">
                {initials}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-[12.5px] font-semibold">{displayName}</div>
                <div className="truncate text-[10.5px] text-muted-foreground">Big Cloak</div>
              </div>
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="text-xs">
                <div className="truncate font-semibold">{email || displayName}</div>
                <div className="font-normal text-muted-foreground">Operador</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/admin/settings">
                  <Settings className="h-3.5 w-3.5" />
                  Configurações
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Coluna principal ──────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-top sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur md:h-[68px] md:py-0 md:px-8">
          {/* Marca/título no mobile */}
          <div className="flex min-w-0 items-center gap-2.5 md:hidden">
            <BrandMark size={30} />
            <div className="min-w-0">
              <div className="truncate text-[14.5px] font-extrabold tracking-tight leading-tight">
                {currentTitle}
              </div>
              <div className="truncate text-[10px] text-muted-foreground leading-tight">
                Big Cloak
              </div>
            </div>
          </div>
          <div className="hidden md:block" />

          <div className="flex items-center justify-end gap-2">
            {onPeriod && (
              <Popover open={periodOpen} onOpenChange={setPeriodOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "tap inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[12.5px] font-medium outline-none transition-all",
                      "hover:border-primary/40 hover:bg-secondary",
                    )}
                  >
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="tabular-nums md:hidden">
                      {period === "custom" && customStart
                        ? fmtBrDate(customStart)
                        : PERIOD_SHORT[period ?? "today"]}
                    </span>
                    <span className="hidden tabular-nums md:inline">{periodButtonLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[min(92vw,auto)] overflow-hidden p-0"
                >
                  <div className="flex flex-col sm:flex-row">
                    <div className="border-b border-border py-2 sm:w-44 sm:border-b-0 sm:border-r">
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
                              "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[13px] transition-colors",
                              active
                                ? "bg-primary/10 font-semibold text-primary"
                                : "text-foreground hover:bg-secondary",
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
                          numberOfMonths={1}
                          selected={rangeSel}
                          onSelect={(r) => {
                            if (r?.from && r?.to && onCustomRange) {
                              onCustomRange(toYmd(r.from), toYmd(r.to));
                            }
                          }}
                          className={cn("pointer-events-auto")}
                        />
                        <div className="flex items-center justify-end gap-2 px-2 pb-2">
                          <Button size="sm" variant="ghost" onClick={() => setPeriodOpen(false)}>
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

            {rightSlot}

            <DropdownMenu>
              <DropdownMenuTrigger className="tap hidden items-center gap-2.5 rounded-full border border-border bg-card py-1 pl-1 pr-3 outline-none hover:bg-secondary md:flex">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">
                  {initials}
                </div>
                <div className="text-left leading-tight">
                  <div className="text-[12px] font-semibold">{displayName}</div>
                  <div className="text-[10px] text-muted-foreground">Administrador</div>
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">
                  <div className="truncate font-semibold">{email || displayName}</div>
                  <div className="font-normal text-muted-foreground">Operador</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin/settings">
                    <Settings className="h-3.5 w-3.5" />
                    Configurações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Conteúdo — padding inferior reserva espaço para a barra do celular */}
        <main className="min-w-0 flex-1 pb-[76px] md:pb-0">{children}</main>

        {/* ── Barra inferior (mobile) ────────────────────────────────── */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-sidebar/95 pt-1.5 backdrop-blur md:hidden">
          {MOBILE_PRIMARY.map((item) => {
            const active = isActive(pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-1 py-1 text-[10px] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.4 : 2} />
                <span className="truncate">{item.shortLabel}</span>
              </Link>
            );
          })}

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-1 py-1 text-[10px] font-semibold outline-none transition-colors",
                overflowActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <MoreHorizontal className="h-[19px] w-[19px]" />
              <span>Mais</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="mb-2 w-52">
              <DropdownMenuLabel className="text-xs">
                <div className="truncate font-semibold">{email || displayName}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MOBILE_OVERFLOW.map((item) => (
                <DropdownMenuItem key={item.to} asChild>
                  <Link to={item.to}>
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </div>
  );
}
