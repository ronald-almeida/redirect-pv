import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type ClickRow,
  type Mode,
  aggregate,
  countryFlag,
  topEntries,
} from "@/lib/analytics";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics · Painel" },
      { name: "description", content: "Analytics global dos links." },
    ],
  }),
  component: AnalyticsPage,
});

interface LinkLite {
  id: string;
  slug: string;
}

function AnalyticsPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [links, setLinks] = useState<LinkLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      setChecking(false);
      void loadAll();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/login" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: c }, { data: l }] = await Promise.all([
      supabase
        .from("clicks")
        .select(
          "link_id, mode_at_click, country, device, is_vpn, utm_source, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("links").select("id, slug"),
    ]);
    setClicks((c ?? []) as ClickRow[]);
    setLinks((l ?? []) as LinkLite[]);
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const data = useMemo(() => {
    const totals = { real: 0, decoy: 0, waiting: 0 };
    const countries: Record<string, number> = {};
    const devices = { mobile: 0, desktop: 0 };
    const perLink: Record<string, number> = {};
    const perDay: Record<string, number> = {};

    // Build last 30 days (oldest -> newest) skeleton
    const days: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push(key);
      perDay[key] = 0;
    }
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 29);

    for (const r of clicks) {
      const baseMode = r.mode_at_click.split(":")[0] as Mode;
      if (baseMode === "real" || baseMode === "decoy" || baseMode === "waiting") {
        totals[baseMode] += 1;
      }
      if (r.country) countries[r.country] = (countries[r.country] ?? 0) + 1;
      if (r.device === "mobile") devices.mobile += 1;
      else if (r.device === "desktop") devices.desktop += 1;
      perLink[r.link_id] = (perLink[r.link_id] ?? 0) + 1;
      const day = r.created_at.slice(0, 10);
      if (new Date(day).getTime() >= cutoff.getTime() && day in perDay) {
        perDay[day] += 1;
      }
    }

    const slugById = new Map(links.map((l) => [l.id, l.slug]));
    const topLinks = topEntries(perLink, 5).map(([id, n]) => ({
      id,
      slug: slugById.get(id) ?? id.slice(0, 8),
      count: n,
    }));
    const topCountries = topEntries(countries, 5);
    const totalDevices = devices.mobile + devices.desktop;
    const chartData = days.map((d) => ({
      day: d.slice(5),
      cliques: perDay[d],
    }));

    return { totals, topLinks, topCountries, devices, totalDevices, chartData };
  }, [clicks, links]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const mobilePct = data.totalDevices
    ? (data.devices.mobile / data.totalDevices) * 100
    : 0;
  const desktopPct = data.totalDevices
    ? (data.devices.desktop / data.totalDevices) * 100
    : 0;
  const allTotal = data.totals.real + data.totals.decoy + data.totals.waiting;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold">Analytics</h1>
            <nav className="flex gap-4 text-sm">
              <Link
                to="/admin"
                className="text-muted-foreground hover:text-foreground"
              >
                Links
              </Link>
              <Link
                to="/admin/analytics"
                className="font-medium text-foreground"
              >
                Analytics
              </Link>
            </nav>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {loading && (
          <p className="text-sm text-muted-foreground">Carregando dados…</p>
        )}

        <Card className="p-6">
          <h2 className="mb-4 text-base font-medium">Total de cliques</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TotalBox label="Total geral" value={allTotal} dot="bg-foreground" />
            <TotalBox label="Real" value={data.totals.real} dot="bg-emerald-500" />
            <TotalBox label="Isca" value={data.totals.decoy} dot="bg-amber-500" />
            <TotalBox
              label="Espera"
              value={data.totals.waiting}
              dot="bg-muted-foreground/60"
            />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-medium">Cliques nos últimos 30 dias</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="cliques"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-4 text-base font-medium">Top 5 links</h2>
            {data.topLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            ) : (
              <ul className="space-y-2">
                {data.topLinks.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <span className="font-mono">/{l.slug}</span>
                    <span className="tabular-nums font-medium">{l.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 text-base font-medium">Top países</h2>
            {data.topCountries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            ) : (
              <ul className="space-y-2">
                {data.topCountries.map(([cc, n]) => (
                  <li
                    key={cc}
                    className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base">{countryFlag(cc)}</span>
                      <span className="font-mono">{cc}</span>
                    </span>
                    <span className="tabular-nums font-medium">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-medium">Dispositivos (geral)</h2>
          {data.totalDevices === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                <div className="bg-sky-500" style={{ width: `${mobilePct}%` }} />
                <div
                  className="bg-violet-500"
                  style={{ width: `${desktopPct}%` }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  Mobile {mobilePct.toFixed(0)}% ({data.devices.mobile})
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-violet-500" />
                  Desktop {desktopPct.toFixed(0)}% ({data.devices.desktop})
                </span>
              </div>
            </div>
          )}
        </Card>

        <p className="text-xs text-muted-foreground">
          Mostrando até os 1000 cliques mais recentes.
        </p>
      </main>
    </div>
  );
}

function TotalBox({
  label,
  value,
  dot,
}: {
  label: string;
  value: number;
  dot: string;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
