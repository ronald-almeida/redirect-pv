import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/r/$slug")({
  component: SlugPage,
});

interface LinkRow {
  id: string;
  mode: string;
  real_url: string | null;
  decoy_url: string | null;
  active: boolean;
  expires_at: string | null;
  click_limit: number | null;
  click_count: number;
  access_password: string | null;
  allowed_countries: string[] | null;
  blocked_ips: string[] | null;
  real_urls: string[] | null;
  ab_test: boolean;
  rotation_index: number;
}

// Minimum columns needed to decide where to redirect
const LINK_COLUMNS =
  "id, mode, real_url, decoy_url, active, expires_at, click_limit, click_count, access_password, allowed_countries, blocked_ips, real_urls, ab_test, rotation_index";

const BOT_REGEX =
  /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|whatsapp|telegram|discord|slack|linkedin|embedly|preview|fetch|monitor|curl|wget|python-requests|httpclient|axios|headless/i;

// In-memory cache (30s TTL)
const CACHE_TTL = 30_000;
const linkCache = new Map<string, { row: LinkRow; ts: number }>();
let cachedWaitingUrl: { url: string | null; ts: number } | null = null;
let waitingUrlPromise: Promise<string | null> | null = null;

// Eagerly prefetch the default waiting URL on module load so it's ready
// in cache by the time the redirect logic needs it.
if (typeof window !== "undefined") {
  waitingUrlPromise = supabase
    .from("settings")
    .select("default_waiting_url")
    .limit(1)
    .maybeSingle()
    .then(({ data }) => {
      const url = data?.default_waiting_url ?? null;
      cachedWaitingUrl = { url, ts: Date.now() };
      return url;
    });
}

function getCachedLink(slug: string): LinkRow | null {
  const hit = linkCache.get(slug);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.row;
  if (hit) linkCache.delete(slug);
  return null;
}

function setCachedLink(slug: string, row: LinkRow) {
  linkCache.set(slug, { row, ts: Date.now() });
}

function detectDevice(): "mobile" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
    ? "mobile"
    : "desktop";
}

function getUtmParams() {
  if (typeof window === "undefined") {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get("utm_source"),
    utm_medium: p.get("utm_medium"),
    utm_campaign: p.get("utm_campaign"),
  };
}

// Fire-and-forget tracking. Resolves geo/VPN async, inserts click row, increments counter.
function trackInBackground(linkId: string, modeAtClick: string) {
  const utm = getUtmParams();
  const device = detectDevice();

  // Increment counter immediately (cheap, doesn't need geo)
  supabase.rpc("increment_link_click", { _link_id: linkId }).then(() => {});

  // Geo lookup + insert click — fully async, never awaited
  fetch("https://ipapi.co/json/")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const geo = j
        ? {
            ip: j.ip ?? null,
            country: j.country_code ?? j.country ?? null,
            is_vpn: Boolean(j.proxy || j.hosting || j.security?.vpn),
          }
        : { ip: null, country: null, is_vpn: false };
      return supabase.from("clicks").insert({
        link_id: linkId,
        mode_at_click: modeAtClick,
        ip: geo.ip,
        country: geo.country,
        device,
        is_vpn: geo.is_vpn,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
      });
    })
    .catch(() => {
      // Best-effort: still log click without geo
      supabase
        .from("clicks")
        .insert({
          link_id: linkId,
          mode_at_click: modeAtClick,
          device,
          is_vpn: false,
          utm_source: utm.utm_source,
          utm_medium: utm.utm_medium,
          utm_campaign: utm.utm_campaign,
        })
        .then(() => {});
    });
}

async function getWaitingUrl(): Promise<string | null> {
  if (cachedWaitingUrl && Date.now() - cachedWaitingUrl.ts < CACHE_TTL) {
    return cachedWaitingUrl.url;
  }
  const { data } = await supabase
    .from("settings")
    .select("default_waiting_url")
    .limit(1)
    .maybeSingle();
  const url = data?.default_waiting_url ?? null;
  cachedWaitingUrl = { url, ts: Date.now() };
  return url;
}

function SlugPage() {
  const { slug } = Route.useParams();
  const [link, setLink] = useState<LinkRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [showWaitingPage, setShowWaitingPage] = useState(false);
  const pendingRealUrl = useRef<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;

    const run = async () => {
      // 1. Try cache first
      let row = getCachedLink(slug);

      if (!row) {
        const { data, error } = await supabase
          .from("links")
          .select(LINK_COLUMNS)
          .eq("slug", slug)
          .maybeSingle();

        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
          return;
        }
        row = data as unknown as LinkRow;
        setCachedLink(slug, row);
      }

      setLink(row);

      const userAgent =
        typeof navigator !== "undefined" ? navigator.userAgent : "";
      const isBot = BOT_REGEX.test(userAgent);

      const goAndTrack = (url: string, modeAtClick: string) => {
        trackInBackground(row!.id, modeAtClick);
        if (!cancelled) window.location.replace(url);
      };

      const goDecoy = async (reason: string) => {
        if (row!.decoy_url) return goAndTrack(row!.decoy_url, `decoy:${reason}`);
        const w = await getWaitingUrl();
        if (w) return goAndTrack(w, `waiting:${reason}`);
        setShowWaitingPage(true);
      };

      // Pre-redirect checks (no geo — VPN/country handled async or skipped)
      if (!row.active) return goDecoy("inactive");
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
        return goDecoy("expired");
      if (isBot) return goDecoy("bot");

      if (row.mode === "waiting") {
        const w = await getWaitingUrl();
        if (w) return goAndTrack(w, "waiting");
        setShowWaitingPage(true);
        return;
      }

      if (row.mode === "decoy") {
        if (row.decoy_url) return goAndTrack(row.decoy_url, "decoy");
        setShowWaitingPage(true);
        return;
      }

      // real mode
      if (row.click_limit !== null && row.click_count >= row.click_limit) {
        supabase.from("links").update({ mode: "waiting" }).eq("id", row.id).then(() => {});
        const w = await getWaitingUrl();
        if (w) return goAndTrack(w, "waiting");
        setShowWaitingPage(true);
        return;
      }

      const pool =
        row.real_urls && row.real_urls.length > 0
          ? row.real_urls
          : row.real_url
            ? [row.real_url]
            : [];

      if (pool.length === 0) return goDecoy("no_real_url");

      let dest: string;
      if (row.ab_test && pool.length >= 2) {
        dest = Math.random() < 0.5 ? pool[0] : pool[1];
      } else if (pool.length > 1) {
        dest = pool[row.rotation_index % pool.length];
      } else {
        dest = pool[0];
      }

      if (row.access_password) {
        pendingRealUrl.current = dest;
        setNeedsPassword(true);
        return;
      }

      return goAndTrack(dest, "real");
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!link || !pendingRealUrl.current) return;
    if (pwInput !== link.access_password) {
      setPwError("Senha incorreta");
      return;
    }
    trackInBackground(link.id, "real");
    window.location.replace(pendingRealUrl.current);
  };

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <div className="text-5xl">🔗</div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Link não encontrado
          </h1>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <form
          onSubmit={submitPassword}
          className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow"
        >
          <div className="text-center">
            <div className="text-4xl">🔒</div>
            <h1 className="mt-3 text-lg font-semibold">Acesso restrito</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Digite a senha para continuar.
            </p>
          </div>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => {
              setPwInput(e.target.value);
              setPwError(null);
            }}
            autoFocus
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Senha"
          />
          {pwError && <p className="text-sm text-destructive">{pwError}</p>}
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Entrar
          </button>
        </form>
      </div>
    );
  }

  if (showWaitingPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <div className="text-6xl" aria-hidden>⏳</div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
            Link em breve
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Este link está sendo configurado.
          </p>
        </div>
      </div>
    );
  }

  // Instant minimal spinner — no text
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
    </div>
  );
}
