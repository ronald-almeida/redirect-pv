import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/r/$slug")({
  component: SlugPage,
});

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

interface GeoInfo {
  ip: string | null;
  country: string | null;
  is_vpn: boolean;
}

const BOT_REGEX =
  /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|whatsapp|telegram|discord|slack|linkedin|embedly|preview|fetch|monitor|curl|wget|python-requests|httpclient|axios|headless/i;

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

async function fetchGeo(): Promise<GeoInfo> {
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) throw new Error("geo fetch failed");
    const j = await res.json();
    const proxy = Boolean(j.proxy || j.hosting || j.security?.vpn);
    return {
      ip: j.ip ?? null,
      country: j.country_code ?? j.country ?? null,
      is_vpn: proxy,
    };
  } catch {
    return { ip: null, country: null, is_vpn: false };
  }
}

function SlugPage() {
  const { slug } = Route.useParams();
  const [link, setLink] = useState<LinkRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const pendingRealUrl = useRef<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;

    const run = async () => {
      const { data, error } = await supabase
        .from("links")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const row = data as unknown as LinkRow;
      setLink(row);

      const utm = getUtmParams();
      const device = detectDevice();
      const userAgent =
        typeof navigator !== "undefined" ? navigator.userAgent : "";
      const isBot = BOT_REGEX.test(userAgent);

      const geo = await fetchGeo();
      if (cancelled) return;

      const trackAndGo = async (url: string, modeAtClick: string) => {
        await supabase.from("clicks").insert({
          link_id: row.id,
          mode_at_click: modeAtClick,
          ip: geo.ip,
          country: geo.country,
          device,
          is_vpn: geo.is_vpn,
          utm_source: utm.utm_source,
          utm_medium: utm.utm_medium,
          utm_campaign: utm.utm_campaign,
        });
        await supabase.rpc("increment_link_click", { _link_id: row.id });
        if (!cancelled) window.location.replace(url);
      };

      const goDecoy = async (reason: string) => {
        const fallback = row.decoy_url;
        if (fallback) return trackAndGo(fallback, `decoy:${reason}`);
        // No decoy configured → fall through to waiting
        const { data: s } = await supabase
          .from("settings")
          .select("default_waiting_url")
          .limit(1)
          .maybeSingle();
        if (s?.default_waiting_url) {
          return trackAndGo(s.default_waiting_url, `waiting:${reason}`);
        }
        setLoading(false);
      };

      // 1. inactive
      if (!row.active) return goDecoy("inactive");
      // 2. expired
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
        return goDecoy("expired");
      // 3. blocked IP
      if (geo.ip && row.blocked_ips?.includes(geo.ip))
        return goDecoy("blocked_ip");
      // 4. bot
      if (isBot) return goDecoy("bot");
      // 5. VPN
      if (geo.is_vpn) return goDecoy("vpn");
      // 6. country gate
      if (
        row.allowed_countries &&
        row.allowed_countries.length > 0 &&
        (!geo.country || !row.allowed_countries.includes(geo.country))
      ) {
        return goDecoy("country");
      }

      // 7. waiting mode
      if (row.mode === "waiting") {
        const { data: s } = await supabase
          .from("settings")
          .select("default_waiting_url")
          .limit(1)
          .maybeSingle();
        if (s?.default_waiting_url)
          return trackAndGo(s.default_waiting_url, "waiting");
        setLoading(false);
        return;
      }

      // 8. decoy mode
      if (row.mode === "decoy") {
        if (row.decoy_url) return trackAndGo(row.decoy_url, "decoy");
        setLoading(false);
        return;
      }

      // 9. real mode
      // click_limit reached → switch to waiting
      if (
        row.click_limit !== null &&
        row.click_count >= row.click_limit
      ) {
        await supabase
          .from("links")
          .update({ mode: "waiting" })
          .eq("id", row.id);
        const { data: s } = await supabase
          .from("settings")
          .select("default_waiting_url")
          .limit(1)
          .maybeSingle();
        if (s?.default_waiting_url)
          return trackAndGo(s.default_waiting_url, "waiting");
        setLoading(false);
        return;
      }

      // pick destination
      const pool = row.real_urls && row.real_urls.length > 0
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

      // password gate
      if (row.access_password) {
        pendingRealUrl.current = dest;
        setNeedsPassword(true);
        setLoading(false);
        return;
      }

      return trackAndGo(dest, "real");
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link || !pendingRealUrl.current) return;
    if (pwInput !== link.access_password) {
      setPwError("Senha incorreta");
      return;
    }
    const utm = getUtmParams();
    const device = detectDevice();
    const geo = await fetchGeo();
    await supabase.from("clicks").insert({
      link_id: link.id,
      mode_at_click: "real",
      ip: geo.ip,
      country: geo.country,
      device,
      is_vpn: geo.is_vpn,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
    });
    await supabase.rpc("increment_link_click", { _link_id: link.id });
    window.location.replace(pendingRealUrl.current);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    );
  }

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
          {pwError && (
            <p className="text-sm text-destructive">{pwError}</p>
          )}
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="text-6xl" aria-hidden>
          {link?.page_icon ?? "⏳"}
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
          {link?.page_title ?? "Link em breve"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {link?.page_message ?? "Este link está sendo configurado."}
        </p>
      </div>
    </div>
  );
}
