import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { countryFlag } from "@/lib/analytics";
import {
  Search as SearchIcon, ArrowUpDown, ChevronLeft, ChevronRight,
  Smartphone, Monitor, MousePointerClick, Filter, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface IndividualClicksProps {
  startIso: string;
  endIso: string;
  /** Optional pre-filter by slug from URL or parent context */
  initialSlug?: string;
}

interface ClickFull {
  id: string;
  link_id: string;
  mode_at_click: string;
  cache_status: string | null;
  redirect_ms: number | null;
  country: string | null;
  device: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
}

interface LinkLite { id: string; slug: string; name: string | null }

type SortKey = "recent" | "old" | "slow" | "fast";
type Mode = "all" | "real" | "decoy" | "waiting";
type Cache = "all" | "MEM" | "HIT" | "STALE" | "MISS";
type Device = "all" | "mobile" | "desktop" | "unknown";

const SORT_LABEL: Record<SortKey, string> = {
  recent: "Mais recentes",
  old: "Mais antigos",
  slow: "Mais lentos",
  fast: "Mais rápidos",
};

const NA = "Não informado";
const PAGE_SIZE = 25;

export function IndividualClicks({ startIso, endIso, initialSlug }: IndividualClicksProps) {
  const [rows, setRows] = useState<ClickFull[]>([]);
  const [links, setLinks] = useState<LinkLite[]>([]);
  const [loading, setLoading] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [slug, setSlug] = useState<string>(initialSlug ?? "all");
  const [mode, setMode] = useState<Mode>("all");
  const [cache, setCache] = useState<Cache>("all");
  const [device, setDevice] = useState<Device>("all");
  const [country, setCountry] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);

  useEffect(() => {
    void load();
    // reset page on range change
    setPage(1);
  }, [startIso, endIso]);

  async function load() {
    setLoading(true);
    const [c, l] = await Promise.all([
      supabase
        .from("clicks")
        .select("id, link_id, mode_at_click, cache_status, redirect_ms, country, device, utm_source, utm_medium, utm_campaign, created_at")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("links").select("id, slug, name"),
    ]);
    setRows((c.data ?? []) as ClickFull[]);
    setLinks((l.data ?? []) as LinkLite[]);
    setLoading(false);
  }

  const linkMap = useMemo(() => new Map(links.map((l) => [l.id, l])), [links]);

  // unique countries for dropdown
  const countries = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.country) s.add(r.country);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      const link = linkMap.get(r.link_id);
      const baseMode = r.mode_at_click.split(":")[0];
      const dev = (r.device ?? "unknown") as Device;
      const cache_s = (r.cache_status ?? "") as string;

      if (slug !== "all" && link?.slug !== slug) return false;
      if (mode !== "all" && baseMode !== mode) return false;
      if (cache !== "all" && cache_s !== cache) return false;
      if (device !== "all" && dev !== device) return false;
      if (country !== "all" && r.country !== country) return false;
      if (q) {
        const blob = `${link?.slug ?? ""} ${link?.name ?? ""} ${r.utm_source ?? ""} ${r.utm_campaign ?? ""} ${r.country ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "recent") return +new Date(b.created_at) - +new Date(a.created_at);
      if (sort === "old") return +new Date(a.created_at) - +new Date(b.created_at);
      const aMs = a.redirect_ms ?? -1;
      const bMs = b.redirect_ms ?? -1;
      if (sort === "slow") return bMs - aMs;
      return aMs - bMs; // fast
    });
    return list;
  }, [rows, linkMap, search, slug, mode, cache, device, country, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, slug, mode, cache, device, country, sort]);

  const hasFilters = slug !== "all" || mode !== "all" || cache !== "all" || device !== "all" || country !== "all" || search !== "";
  function clearFilters() {
    setSearch(""); setSlug("all"); setMode("all"); setCache("all"); setDevice("all"); setCountry("all");
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* header */}
      <div className="flex flex-col gap-3 border-b border-border px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <MousePointerClick className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Cliques Individuais</h2>
              <p className="text-[11.5px] text-muted-foreground">
                {loading ? "Carregando…" : `${filtered.length.toLocaleString("pt-BR")} cliques no período · tempo medido pelo Worker (Server-Timing)`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por slug, UTM, país…"
                className="h-9 w-[240px] rounded-full border border-border bg-secondary pl-9 pr-3 text-[12.5px] outline-none focus:border-primary"
              />
            </div>
            <Select value={sort} onChange={(v) => setSort(v as SortKey)} icon={<ArrowUpDown className="h-3.5 w-3.5" />}>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </Select>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-secondary px-3 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill icon={<Filter className="h-3 w-3" />} label="Filtros" />
          <Select value={slug} onChange={(v) => setSlug(v)}>
            <option value="all">Todos os links</option>
            {links.map((l) => <option key={l.id} value={l.slug}>/{l.slug}</option>)}
          </Select>
          <Select value={mode} onChange={(v) => setMode(v as Mode)}>
            <option value="all">Todos os tipos</option>
            <option value="real">Real</option>
            <option value="decoy">Isca</option>
            <option value="waiting">Espera</option>
          </Select>
          <Select value={cache} onChange={(v) => setCache(v as Cache)}>
            <option value="all">Todos os caches</option>
            <option value="MEM">MEM</option>
            <option value="HIT">HIT</option>
            <option value="STALE">STALE</option>
            <option value="MISS">MISS</option>
          </Select>
          <Select value={device} onChange={(v) => setDevice(v as Device)}>
            <option value="all">Todos os dispositivos</option>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
            <option value="unknown">Não identificado</option>
          </Select>
          <Select value={country} onChange={(v) => setCountry(v)}>
            <option value="all">Todos os países</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
      </div>

      {/* table */}
      {visible.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <MousePointerClick className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Nenhum clique encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasFilters ? "Ajuste os filtros para ampliar a busca." : "Ainda não há cliques registrados neste período."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <Th>Data</Th>
                <Th>Hora</Th>
                <Th>Link / Slug</Th>
                <Th>Tipo</Th>
                <Th>Cache</Th>
                <Th className="text-right">Redirect</Th>
                <Th>País</Th>
                <Th>Dispositivo</Th>
                <Th>Origem / UTM</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const link = linkMap.get(r.link_id);
                const slugTxt = link?.slug ?? r.link_id.slice(0, 6);
                const d = new Date(r.created_at);
                const dateTxt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                const timeTxt = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                const baseMode = r.mode_at_click.split(":")[0] as "real" | "decoy" | "waiting";
                const modeLabel = baseMode === "real" ? "Real" : baseMode === "decoy" ? "Isca" : "Espera";
                const cacheS = (r.cache_status as "MEM" | "HIT" | "STALE" | "MISS" | null);
                const ms = r.redirect_ms;
                const msTone =
                  ms == null ? "text-muted-foreground" :
                  ms < 100 ? "text-primary" :
                  ms < 300 ? "text-[#F59E0B]" : "text-destructive";
                const dev = (r.device ?? "").toLowerCase();
                const DevIcon = dev === "mobile" ? Smartphone : dev === "desktop" ? Monitor : null;
                const utm = [r.utm_source, r.utm_medium, r.utm_campaign].filter(Boolean).join(" · ");
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                    <Td mono>{dateTxt}</Td>
                    <Td mono>{timeTxt}</Td>
                    <Td>
                      <div className="font-mono text-[12.5px]">/{slugTxt}</div>
                      {link?.name && <div className="text-[10.5px] text-muted-foreground truncate max-w-[180px]">{link.name}</div>}
                    </Td>
                    <Td>
                      <StatusBadge kind={baseMode} label={modeLabel} />
                    </Td>
                    <Td>
                      {cacheS ? <StatusBadge kind={cacheS} dot /> : <span className="text-muted-foreground">{NA}</span>}
                    </Td>
                    <Td className={cn("text-right tabular-nums font-semibold", msTone)}>
                      {ms != null ? `${ms}ms` : <span className="text-muted-foreground font-normal">{NA}</span>}
                    </Td>
                    <Td>
                      {r.country ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-base leading-none">{countryFlag(r.country)}</span>
                          <span className="font-mono text-[11.5px] text-muted-foreground">{r.country}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{NA}</span>
                      )}
                    </Td>
                    <Td>
                      {DevIcon ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px]">
                          <DevIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {dev === "mobile" ? "Mobile" : "Desktop"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{NA}</span>
                      )}
                    </Td>
                    <Td>
                      {utm ? (
                        <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10.5px] text-foreground/80" title={utm}>
                          {utm.length > 28 ? utm.slice(0, 28) + "…" : utm}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{NA}</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-[12px]">
          <div className="text-muted-foreground">
            Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length.toLocaleString("pt-BR")} cliques
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 tabular-nums text-muted-foreground">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-3 py-2.5 font-semibold first:pl-5 last:pr-5", className)}>{children}</th>;
}
function Td({ children, className, mono }: { children: React.ReactNode; className?: string; mono?: boolean }) {
  return <td className={cn("px-3 py-2.5 first:pl-5 last:pr-5", mono && "font-mono tabular-nums text-[11.5px] text-muted-foreground", className)}>{children}</td>;
}

function Select({
  value, onChange, children, icon,
}: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; icon?: React.ReactNode;
}) {
  return (
    <div className="relative inline-flex items-center">
      {icon && <span className="pointer-events-none absolute left-2.5 text-muted-foreground">{icon}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 appearance-none rounded-full border border-border bg-secondary pr-7 text-[12px] outline-none focus:border-primary hover:text-foreground",
          icon ? "pl-7" : "pl-3",
        )}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-muted-foreground">▾</span>
    </div>
  );
}

function FilterPill({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-transparent px-3 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}{label}
    </span>
  );
}
