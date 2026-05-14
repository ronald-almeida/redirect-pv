import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  Copy,
  Trash2,
  Plus,
  Search,
  ChevronDown,
  Settings2,
  Files,
  Smartphone,
  Monitor,
  ShieldAlert,
  Link2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminShell,
  ADMIN_COLORS,
  countryFlag,
} from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Links · CloakPanel" },
      { name: "description", content: "Gerenciar links de redirecionamento." },
    ],
  }),
  component: AdminPage,
});

type Mode = "real" | "decoy" | "waiting";

interface LinkRow {
  id: string;
  slug: string;
  mode: string;
  real_url: string | null;
  decoy_url: string | null;
  page_title: string | null;
  page_message: string | null;
  page_icon: string | null;
  active: boolean;
  created_at: string;
}

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

const MODE_PILL: Record<Mode, { label: string; color: string }> = {
  real: { label: "Real", color: ADMIN_COLORS.success },
  decoy: { label: "Isca", color: ADMIN_COLORS.warning },
  waiting: { label: "Espera", color: "#71717a" },
};

function normalizeMode(m: string | null | undefined): Mode {
  if (m === "real" || m?.startsWith("real")) return "real";
  if (m === "decoy" || m?.startsWith("decoy")) return "decoy";
  return "waiting";
}

function AdminPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [origin, setOrigin] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [defaultWaitingUrl, setDefaultWaitingUrl] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      setChecking(false);
      loadAll();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/login" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const loadAll = async () => {
    const [l, c, s] = await Promise.all([
      supabase
        .from("links")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("clicks")
        .select(
          "id,link_id,mode_at_click,country,device,is_vpn,utm_source,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("settings")
        .select("id,default_waiting_url")
        .limit(1)
        .maybeSingle(),
    ]);
    setLinks((l.data ?? []) as LinkRow[]);
    setClicks((c.data ?? []) as ClickRow[]);
    if (s.data) {
      setSettingsId(s.data.id);
      setDefaultWaitingUrl(s.data.default_waiting_url ?? "");
    }
  };

  const clicksByLink = useMemo(() => {
    const map = new Map<string, ClickRow[]>();
    for (const c of clicks) {
      const arr = map.get(c.link_id) ?? [];
      arr.push(c);
      map.set(c.link_id, arr);
    }
    return map;
  }, [clicks]);

  const filteredLinks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return links;
    return links.filter((l) => l.slug.toLowerCase().includes(q));
  }, [links, search]);

  const updateLocal = (id: string, patch: Partial<LinkRow>) =>
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );

  const persist = async (l: LinkRow, patch: Partial<LinkRow>) => {
    const { error } = await supabase
      .from("links")
      .update(patch)
      .eq("id", l.id);
    if (error) alert(error.message);
  };

  const setMode = (l: LinkRow, mode: Mode) => {
    updateLocal(l.id, { mode });
    persist(l, { mode });
  };

  const setActive = (l: LinkRow, active: boolean) => {
    updateLocal(l.id, { active });
    persist(l, { active });
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const cleanSlug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    if (!cleanSlug) return;
    const { error } = await supabase
      .from("links")
      .insert({ slug: cleanSlug, mode: "waiting" });
    if (error) return alert(error.message);
    setNewSlug("");
    loadAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este link?")) return;
    await supabase.from("links").delete().eq("id", id);
    loadAll();
  };

  const handleDuplicate = async (l: LinkRow) => {
    let base = `${l.slug}-copy`;
    let candidate = base;
    let i = 1;
    while (links.some((x) => x.slug === candidate)) {
      candidate = `${base}-${i++}`;
    }
    const { error } = await supabase.from("links").insert({
      slug: candidate,
      mode: l.mode,
      real_url: l.real_url,
      decoy_url: l.decoy_url,
      page_title: l.page_title,
      page_message: l.page_message,
      page_icon: l.page_icon,
      active: l.active,
    });
    if (error) return alert(error.message);
    loadAll();
  };

  const saveSettings = async () => {
    if (!settingsId) return;
    await supabase
      .from("settings")
      .update({ default_waiting_url: defaultWaitingUrl.trim() })
      .eq("id", settingsId);
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${origin}/r/${slug}`);
  };

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
        {/* Settings */}
        <Panel>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-medium text-white">
                Configurações Globais
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-zinc-400 transition-transform ${
                settingsOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {settingsOpen && (
            <div className="mt-4 space-y-2">
              <label className="text-xs text-zinc-400">
                Link padrão de espera
              </label>
              <DarkInput
                type="url"
                value={defaultWaitingUrl}
                onChange={(e) => setDefaultWaitingUrl(e.target.value)}
                onBlur={saveSettings}
                placeholder="https://exemplo.com"
              />
            </div>
          )}
        </Panel>

        {/* Header row */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Links
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {links.length} {links.length === 1 ? "link" : "links"} configurados
          </p>
        </div>

        {/* Search + create */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por slug…"
              className="h-10 w-full rounded-lg pl-9 pr-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-indigo-500"
              style={{
                background: ADMIN_COLORS.card,
                border: `1px solid ${ADMIN_COLORS.border}`,
              }}
            />
          </div>
          <form onSubmit={handleCreate} className="flex gap-2">
            <DarkInput
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="novo-slug"
              className="w-44"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: ADMIN_COLORS.primary }}
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </form>
        </div>

        {/* Links */}
        {filteredLinks.length === 0 ? (
          <EmptyState
            hasSearch={!!search}
            onCreate={() => {
              const el = document.querySelector<HTMLInputElement>(
                'input[placeholder="novo-slug"]',
              );
              el?.focus();
            }}
          />
        ) : (
          <div className="space-y-3">
            {filteredLinks.map((l) => (
              <LinkCard
                key={l.id}
                link={l}
                origin={origin}
                expanded={!!expanded[l.id]}
                onToggle={() =>
                  setExpanded((p) => ({ ...p, [l.id]: !p[l.id] }))
                }
                onChangeLocal={(p) => updateLocal(l.id, p)}
                onPersist={(p) => persist(l, p)}
                onSetMode={(m) => setMode(l, m)}
                onSetActive={(a) => setActive(l, a)}
                onCopy={() => copyLink(l.slug)}
                onDelete={() => handleDelete(l.id)}
                onDuplicate={() => handleDuplicate(l)}
                clicks={clicksByLink.get(l.id) ?? []}
              />
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

/* ---------- Components ---------- */

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{
        background: ADMIN_COLORS.card,
        border: `1px solid ${ADMIN_COLORS.border}`,
      }}
    >
      {children}
    </div>
  );
}

function DarkInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", style, ...rest } = props;
  return (
    <input
      {...rest}
      className={`h-10 rounded-lg px-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-indigo-500 ${className}`}
      style={{
        background: "#0f0f0f",
        border: `1px solid ${ADMIN_COLORS.border}`,
        ...style,
      }}
    />
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
      style={{
        background: checked ? ADMIN_COLORS.success : "#3f3f46",
      }}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
        style={{ transform: `translateX(${checked ? 20 : 4}px)` }}
      />
    </button>
  );
}

function ModeBadge({ mode }: { mode: Mode }) {
  const m = MODE_PILL[mode];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        background: `${m.color}1a`,
        color: m.color,
        border: `1px solid ${m.color}40`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

function ModePills({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg p-0.5"
      style={{ background: "#0f0f0f", border: `1px solid ${ADMIN_COLORS.border}` }}
    >
      {(["real", "decoy", "waiting"] as Mode[]).map((m) => {
        const active = m === mode;
        const meta = MODE_PILL[m];
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className="rounded-md px-3 py-1 text-xs font-medium transition-all"
            style={{
              background: active ? `${meta.color}26` : "transparent",
              color: active ? meta.color : "#a1a1aa",
            }}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

function StatChip({
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
      className="rounded-lg px-3 py-2"
      style={{
        background: "#0f0f0f",
        border: `1px solid ${ADMIN_COLORS.border}`,
      }}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-white">
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  hasSearch,
  onCreate,
}: {
  hasSearch: boolean;
  onCreate: () => void;
}) {
  if (hasSearch) {
    return (
      <Panel className="text-center">
        <p className="py-8 text-sm text-zinc-400">
          Nenhum link encontrado para essa busca.
        </p>
      </Panel>
    );
  }
  return (
    <Panel className="text-center">
      <div className="flex flex-col items-center gap-4 py-10">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "#0f0f0f", border: `1px solid ${ADMIN_COLORS.border}` }}
        >
          <Link2 className="h-7 w-7 text-zinc-500" />
        </div>
        <div>
          <h3 className="text-base font-medium text-white">
            Nenhum link criado ainda
          </h3>
          <p className="mt-1 text-sm text-zinc-400">
            Crie seu primeiro link para começar.
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: ADMIN_COLORS.primary }}
        >
          <Plus className="h-4 w-4" />
          Criar primeiro link
        </button>
      </div>
    </Panel>
  );
}

function LinkCard({
  link: l,
  origin,
  expanded,
  onToggle,
  onChangeLocal,
  onPersist,
  onSetMode,
  onSetActive,
  onCopy,
  onDelete,
  onDuplicate,
  clicks,
}: {
  link: LinkRow;
  origin: string;
  expanded: boolean;
  onToggle: () => void;
  onChangeLocal: (p: Partial<LinkRow>) => void;
  onPersist: (p: Partial<LinkRow>) => void;
  onSetMode: (m: Mode) => void;
  onSetActive: (a: boolean) => void;
  onCopy: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  clicks: ClickRow[];
}) {
  const [copied, setCopied] = useState(false);
  const mode = normalizeMode(l.mode);

  const stats = useMemo(() => {
    const s = { real: 0, decoy: 0, waiting: 0, vpn: 0 };
    for (const c of clicks) {
      const m = normalizeMode(c.mode_at_click);
      s[m]++;
      if (c.is_vpn) s.vpn++;
    }
    return s;
  }, [clicks]);

  const topCountries = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clicks) {
      if (!c.country) continue;
      m.set(c.country, (m.get(c.country) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
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

  const utms = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clicks) {
      if (!c.utm_source) continue;
      m.set(c.utm_source, (m.get(c.utm_source) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }, [clicks]);

  const recent = clicks.slice(0, 10);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const fullUrl = `${origin}/r/${l.slug}`;

  return (
    <div
      className="rounded-xl transition-colors"
      style={{
        background: ADMIN_COLORS.card,
        border: `1px solid ${ADMIN_COLORS.border}`,
      }}
    >
      {/* Collapsed header */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          onClick={onToggle}
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Expandir"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>

        <div className="flex items-center gap-2">
          <Toggle checked={l.active} onChange={onSetActive} />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-mono text-sm text-white">
            /{l.slug}
          </span>
          <ModeBadge mode={mode} />
        </div>

        <ModePills mode={mode} onChange={onSetMode} />

        <div className="flex items-center gap-1">
          <IconBtn onClick={handleCopy} title="Copiar link">
            <Copy className="h-4 w-4" />
            <span className="ml-1.5 hidden text-xs sm:inline">
              {copied ? "Copiado!" : "Copiar"}
            </span>
          </IconBtn>
          <IconBtn onClick={onDuplicate} title="Duplicar">
            <Files className="h-4 w-4" />
          </IconBtn>
          <IconBtn onClick={onDelete} title="Remover" danger>
            <Trash2 className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div
          className="space-y-5 p-4 pt-0"
          style={{ borderTop: `1px solid ${ADMIN_COLORS.border}` }}
        >
          <div className="grid gap-4 pt-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  Slug
                </label>
                <DarkInput
                  value={l.slug}
                  onChange={(e) => onChangeLocal({ slug: e.target.value })}
                  onBlur={() =>
                    onPersist({
                      slug: l.slug
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9-_]/g, ""),
                    })
                  }
                  className="font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  Link real
                </label>
                <DarkInput
                  type="url"
                  placeholder="https://destino-real.com"
                  value={l.real_url ?? ""}
                  onChange={(e) => onChangeLocal({ real_url: e.target.value })}
                  onBlur={() =>
                    onPersist({ real_url: l.real_url?.trim() || null })
                  }
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  Link isca
                </label>
                <DarkInput
                  type="url"
                  placeholder="https://site-isca.com"
                  value={l.decoy_url ?? ""}
                  onChange={(e) => onChangeLocal({ decoy_url: e.target.value })}
                  onBlur={() =>
                    onPersist({ decoy_url: l.decoy_url?.trim() || null })
                  }
                  className="w-full"
                />
              </div>
              <div className="text-xs text-zinc-500 break-all">{fullUrl}</div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div
                className="rounded-lg p-2"
                style={{ background: "#fff" }}
              >
                <QRCodeCanvas value={fullUrl} size={120} />
              </div>
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                QR Code
              </span>
            </div>
          </div>

          {/* Analytics */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatChip
                label="Cliques real"
                value={stats.real}
                color={ADMIN_COLORS.success}
              />
              <StatChip
                label="Cliques isca"
                value={stats.decoy}
                color={ADMIN_COLORS.warning}
              />
              <StatChip
                label="Cliques espera"
                value={stats.waiting}
                color="#71717a"
              />
              <StatChip
                label="VPN detectado"
                value={stats.vpn}
                color={ADMIN_COLORS.danger}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <SubPanel title="Top países">
                {topCountries.length === 0 ? (
                  <p className="text-xs text-zinc-500">Sem dados.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {topCountries.map((c) => (
                      <li
                        key={c.country}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="flex items-center gap-2 text-zinc-200">
                          <span>{countryFlag(c.country)}</span>
                          {c.country}
                        </span>
                        <span className="tabular-nums text-zinc-400">
                          {c.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SubPanel>

              <SubPanel title="Dispositivos">
                <div className="space-y-2">
                  <Bar
                    icon={<Smartphone className="h-3.5 w-3.5" />}
                    label="Mobile"
                    count={devices.mobile}
                    pct={devices.mobilePct}
                    color={ADMIN_COLORS.primary}
                  />
                  <Bar
                    icon={<Monitor className="h-3.5 w-3.5" />}
                    label="Desktop"
                    count={devices.desktop}
                    pct={devices.desktopPct}
                    color="#a1a1aa"
                  />
                </div>
              </SubPanel>

              <SubPanel title="UTM source">
                {utms.length === 0 ? (
                  <p className="text-xs text-zinc-500">Sem dados.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {utms.map((u) => (
                      <li
                        key={u.source}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-zinc-200">{u.source}</span>
                        <span className="tabular-nums text-zinc-400">
                          {u.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SubPanel>

              <SubPanel title="Últimos 10 cliques">
                {recent.length === 0 ? (
                  <p className="text-xs text-zinc-500">Sem cliques ainda.</p>
                ) : (
                  <ul className="space-y-1">
                    {recent.map((c) => {
                      const m = normalizeMode(c.mode_at_click);
                      const meta = MODE_PILL[m];
                      return (
                        <li
                          key={c.id}
                          className="flex items-center gap-2 text-xs text-zinc-300"
                        >
                          <span className="w-16 shrink-0 tabular-nums text-zinc-500">
                            {new Date(c.created_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="w-6 text-center">
                            {countryFlag(c.country)}
                          </span>
                          <span className="w-14 text-zinc-500">
                            {c.country ?? "—"}
                          </span>
                          <span className="w-16 text-zinc-500">
                            {c.device ?? "—"}
                          </span>
                          {c.is_vpn && (
                            <ShieldAlert
                              className="h-3 w-3"
                              style={{ color: ADMIN_COLORS.danger }}
                            />
                          )}
                          <span className="ml-auto" style={{ color: meta.color }}>
                            {meta.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SubPanel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "#0f0f0f",
        border: `1px solid ${ADMIN_COLORS.border}`,
      }}
    >
      <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Bar({
  icon,
  label,
  count,
  pct,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="tabular-nums text-zinc-300">
          {count} · {pct}%
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "#1f1f1f" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-8 items-center justify-center rounded-md px-2 text-zinc-400 transition-colors hover:bg-white/5 ${
        danger ? "hover:text-red-400" : "hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
