import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminShell,
  ADMIN_COLORS,
  countryFlag,
} from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics · CloakPanel" },
      { name: "description", content: "Analytics gerais dos links." },
    ],
  }),
  component: AnalyticsPage,
});

interface ClickRow {
  id: string;
  link_id: string;
  mode_at_click: string;
  country: string | null;
  device: string | null;
  is_vpn: boolean | null;
  utm_source: string | null;
  created_at: string;
}

interface LinkRow {
  id: string;
  slug: string;
}

function AnalyticsPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      setChecking(false);
      Promise.all([
        supabase
          .from("clicks")
          .select(
            "id,link_id,mode_at_click,country,device,is_vpn,utm_source,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase.from("links").select("id,slug"),
      ]).then(([c, l]) => {
        setClicks((c.data ?? []) as ClickRow[]);
        setLinks((l.data ?? []) as LinkRow[]);
      });
    });
  }, [navigate]);

  const totals = useMemo(() => {
    const t = { real: 0, decoy: 0, waiting: 0 };
    for (const c of clicks) {
      const m = c.mode_at_click?.startsWith("real")
        ? "real"
        : c.mode_at_click?.startsWith("decoy")
          ? "decoy"
          : "waiting";
      t[m as "real" | "decoy" | "waiting"]++;
    }
    return t;
  }, [clicks]);

  const daily = useMemo(() => {
    const map = new Map<string, number>();
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map.set(key, 0);
    }
    for (const c of clicks) {
      const key = c.created_at.slice(0, 10);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([date, count]) => ({
      date: date.slice(5),
      count,
    }));
  }, [clicks]);

  const topLinks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of clicks)
      counts.set(c.link_id, (counts.get(c.link_id) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({
        slug: links.find((l) => l.id === id)?.slug ?? "—",
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [clicks, links]);

  const topCountries = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clicks) {
      if (!c.country) continue;
      m.set(c.country, (m.get(c.country) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [clicks]);

  const devices = useMemo(() => {
    let mobile = 0,
      desktop = 0;
    for (const c of clicks) {
      if (c.device === "mobile") mobile++;
      else if (c.device === "desktop") desktop++;
    }
    const total = mobile + desktop || 1;
    return {
      mobile,
      desktop,
      mobilePct: Math.round((mobile / total) * 100),
      desktopPct: Math.round((desktop / total) * 100),
    };
  }, [clicks]);

  if (checking) {
    return (
      <AdminShell>
        <p className="text-sm text-zinc-400">Carregando…</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Visão geral de todos os links.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <BigStat
            label="Total real"
            value={totals.real}
            color={ADMIN_COLORS.success}
          />
          <BigStat
            label="Total isca"
            value={totals.decoy}
            color={ADMIN_COLORS.warning}
          />
          <BigStat
            label="Total espera"
            value={totals.waiting}
            color="#71717a"
          />
        </div>

        <Panel title="Cliques por dia (últimos 30 dias)">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={daily}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid stroke="#2a2a2a" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "#2a2a2a" }}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "#2a2a2a" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#a1a1aa" }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={ADMIN_COLORS.primary}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Top 5 links">
            {topLinks.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem dados ainda.</p>
            ) : (
              <ul className="space-y-2">
                {topLinks.map((l, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
                    style={{ background: "#0f0f0f" }}
                  >
                    <span className="font-mono text-zinc-200">/{l.slug}</span>
                    <span className="font-semibold text-white tabular-nums">
                      {l.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Top países">
            {topCountries.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem dados ainda.</p>
            ) : (
              <ul className="space-y-2">
                {topCountries.map((c) => (
                  <li
                    key={c.country}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
                    style={{ background: "#0f0f0f" }}
                  >
                    <span className="flex items-center gap-2 text-zinc-200">
                      <span className="text-base">
                        {countryFlag(c.country)}
                      </span>
                      {c.country}
                    </span>
                    <span className="font-semibold text-white tabular-nums">
                      {c.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Dispositivos">
          <div className="space-y-3">
            <DeviceBar
              label="Mobile"
              count={devices.mobile}
              pct={devices.mobilePct}
              color={ADMIN_COLORS.primary}
            />
            <DeviceBar
              label="Desktop"
              count={devices.desktop}
              pct={devices.desktopPct}
              color="#a1a1aa"
            />
          </div>
        </Panel>
      </div>
    </AdminShell>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: ADMIN_COLORS.card, border: `1px solid ${ADMIN_COLORS.border}` }}
    >
      <h3 className="mb-4 text-sm font-medium text-zinc-300">{title}</h3>
      {children}
    </div>
  );
}

function BigStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: ADMIN_COLORS.card, border: `1px solid ${ADMIN_COLORS.border}` }}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-400">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: color }}
        />
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-white">
        {value}
      </div>
    </div>
  );
}

function DeviceBar({
  label,
  count,
  pct,
  color,
}: {
  label: string;
  count: number;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-200">
          {count} · {pct}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "#0f0f0f" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
