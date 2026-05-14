export type Mode = "real" | "decoy" | "waiting";

export interface ClickRow {
  link_id: string;
  mode_at_click: string;
  country: string | null;
  device: string | null;
  is_vpn: boolean;
  utm_source: string | null;
  created_at: string;
}

export interface LinkAgg {
  real: number;
  decoy: number;
  waiting: number;
  total: number;
  countries: Record<string, number>;
  devices: { mobile: number; desktop: number };
  vpn: number;
  utm: Record<string, number>;
  recent: ClickRow[];
}

export function emptyAgg(): LinkAgg {
  return {
    real: 0,
    decoy: 0,
    waiting: 0,
    total: 0,
    countries: {},
    devices: { mobile: 0, desktop: 0 },
    vpn: 0,
    utm: {},
    recent: [],
  };
}

export function aggregate(rows: ClickRow[]): Record<string, LinkAgg> {
  // assumes rows are sorted desc by created_at
  const out: Record<string, LinkAgg> = {};
  for (const r of rows) {
    const a = (out[r.link_id] ??= emptyAgg());
    const baseMode = (r.mode_at_click.split(":")[0] as Mode);
    if (baseMode === "real" || baseMode === "decoy" || baseMode === "waiting") {
      a[baseMode] += 1;
    }
    a.total += 1;
    if (r.country) a.countries[r.country] = (a.countries[r.country] ?? 0) + 1;
    if (r.device === "mobile") a.devices.mobile += 1;
    else if (r.device === "desktop") a.devices.desktop += 1;
    if (r.is_vpn) a.vpn += 1;
    if (r.utm_source) a.utm[r.utm_source] = (a.utm[r.utm_source] ?? 0) + 1;
    if (a.recent.length < 10) a.recent.push(r);
  }
  return out;
}

export function countryFlag(cc: string | null | undefined): string {
  if (!cc || cc.length !== 2) return "🏳️";
  const code = cc.toUpperCase();
  return String.fromCodePoint(
    ...code.split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export function topEntries(
  obj: Record<string, number>,
  n: number,
): Array<[string, number]> {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
