import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BOT_REGEX =
  /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|whatsapp|telegram|discord|slack|linkedin|embedly|preview|fetch|monitor|curl|wget|python-requests|httpclient|axios|headless/i;

const FALLBACK = "https://google.com";

function pickDestination(link: any, defaultWaiting: string | null, isBot: boolean, ip: string): { url: string; mode: string } {
  const decoy = link.decoy_url || defaultWaiting || FALLBACK;
  const waiting = defaultWaiting || link.decoy_url || FALLBACK;

  if (isBot) return { url: decoy, mode: `decoy:bot` };
  if (!link.active) return { url: decoy, mode: `decoy:inactive` };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now())
    return { url: decoy, mode: `decoy:expired` };
  if (Array.isArray(link.blocked_ips) && ip && link.blocked_ips.includes(ip))
    return { url: decoy, mode: `decoy:blocked_ip` };
  if (link.click_limit !== null && link.click_count >= link.click_limit)
    return { url: waiting, mode: `waiting:limit` };

  if (link.mode === "waiting") return { url: waiting, mode: "waiting" };
  if (link.mode === "decoy") return { url: decoy, mode: "decoy" };

  // real mode
  const pool: string[] =
    Array.isArray(link.real_urls) && link.real_urls.length > 0
      ? link.real_urls
      : link.real_url
        ? [link.real_url]
        : [];

  if (pool.length === 0) return { url: decoy, mode: "decoy:no_real_url" };

  if (link.ab_test && pool.length >= 2) {
    return { url: Math.random() < 0.5 ? pool[0] : pool[1], mode: "real" };
  }
  if (pool.length > 1) {
    const idx = (link.rotation_index || 0) % pool.length;
    return { url: pool[idx], mode: "real" };
  }
  return { url: pool[0], mode: "real" };
}

export const Route = createFileRoute("/api/public/r/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const slug = params.slug;
        const url = new URL(request.url);

        const { data: link } = await supabaseAdmin
          .from("links")
          .select(
            "id, mode, real_url, decoy_url, active, expires_at, click_limit, click_count, allowed_countries, blocked_ips, real_urls, ab_test, rotation_index",
          )
          .eq("slug", slug)
          .maybeSingle();

        if (!link) {
          return Response.redirect(FALLBACK, 302);
        }

        // Fetch default waiting URL only when needed (waiting/decoy paths)
        let defaultWaiting: string | null = null;
        if (
          link.mode === "waiting" ||
          (link.click_limit !== null && link.click_count >= link.click_limit)
        ) {
          const { data: settings } = await supabaseAdmin
            .from("settings")
            .select("default_waiting_url")
            .limit(1)
            .maybeSingle();
          defaultWaiting = settings?.default_waiting_url ?? null;
        }

        const ua = request.headers.get("user-agent") || "";
        const isBot = BOT_REGEX.test(ua);
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
          request.headers.get("cf-connecting-ip") ||
          "";
        const country = request.headers.get("cf-ipcountry") || null;
        const device = /mobile|android|iphone|ipad|ipod/i.test(ua) ? "mobile" : "desktop";

        const { url: destination, mode: modeAtClick } = pickDestination(
          link,
          defaultWaiting,
          isBot,
          ip,
        );

        // Fire-and-forget tracking. Do not await.
        const trackP = Promise.allSettled([
          supabaseAdmin.rpc("increment_link_click", { _link_id: link.id }),
          supabaseAdmin.from("clicks").insert({
            link_id: link.id,
            mode_at_click: modeAtClick,
            ip: ip || null,
            country,
            device,
            is_vpn: false,
            utm_source: url.searchParams.get("utm_source"),
            utm_medium: url.searchParams.get("utm_medium"),
            utm_campaign: url.searchParams.get("utm_campaign"),
          }),
        ]);
        // Best-effort: keep the promise reachable so the runtime doesn't GC it
        // mid-flight, but never block the redirect on it.
        void trackP;

        return new Response(null, {
          status: 302,
          headers: {
            Location: destination,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
