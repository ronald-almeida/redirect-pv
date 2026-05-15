import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cloudflare Workers provides a top-level `waitUntil` from the
// `cloudflare:workers` virtual module that hooks into the current
// request's execution context. We resolve it lazily so non-Workers
// runtimes (local dev SSR) fall back to a no-op without crashing.
let waitUntilImpl: ((p: Promise<unknown>) => void) | null = null;
let waitUntilResolved = false;
async function waitUntilSafe(p: Promise<unknown>): Promise<void> {
  if (!waitUntilResolved) {
    waitUntilResolved = true;
    try {
      const mod: any = await import(/* @vite-ignore */ "cloudflare:workers");
      waitUntilImpl = mod.waitUntil ?? null;
    } catch {
      waitUntilImpl = null;
    }
  }
  if (waitUntilImpl) waitUntilImpl(p);
}

const BOT_REGEX =
  /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|whatsapp|telegram|discord|slack|linkedin|embedly|preview|fetch|monitor|curl|wget|python-requests|httpclient|axios|headless/i;

const FALLBACK = "https://google.com";

function pickDestination(
  link: any,
  defaultWaiting: string | null,
  isBot: boolean,
  ip: string,
): { url: string; mode: string } {
  const decoy = link.decoy_url || defaultWaiting || FALLBACK;
  const waiting = defaultWaiting || link.decoy_url || FALLBACK;

  if (isBot) return { url: decoy, mode: `decoy:bot` };
  if (!link.active) return { url: decoy, mode: `decoy:inactive` };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now())
    return { url: decoy, mode: `decoy:expired` };
  if (Array.isArray(link.blocked_ips) && ip && link.blocked_ips.includes(ip))
    return { url: decoy, mode: `decoy:blocked_ip` };
  if (
    link.owner_only &&
    (!ip || !Array.isArray(link.owner_ips) || !link.owner_ips.includes(ip))
  )
    return { url: decoy, mode: `decoy:owner_only` };
  if (link.click_limit !== null && link.click_count >= link.click_limit)
    return { url: waiting, mode: `waiting:limit` };

  if (link.mode === "waiting") return { url: waiting, mode: "waiting" };
  if (link.mode === "decoy") return { url: decoy, mode: "decoy" };

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

export async function handleRedirect(
  request: Request,
  slug: string,
): Promise<Response> {
  const url = new URL(request.url);

  const { data: link } = await supabaseAdmin
    .from("links")
    .select(
      "id, mode, real_url, decoy_url, active, expires_at, click_limit, click_count, allowed_countries, blocked_ips, real_urls, ab_test, rotation_index, owner_only, owner_ips",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!link) {
    return Response.redirect(FALLBACK, 302);
  }

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
  const device = /mobile|android|iphone|ipad|ipod/i.test(ua)
    ? "mobile"
    : "desktop";

  const { url: destination, mode: modeAtClick } = pickDestination(
    link,
    defaultWaiting,
    isBot,
    ip,
  );

  // Fire-and-forget tracking. On Workers we hand the promise to
  // `waitUntil` so the runtime keeps the worker alive until the writes
  // finish, but the 302 below ships immediately.
  const trackingPromise = Promise.allSettled([
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
  ]).then((results) => {
    for (const [i, r] of results.entries()) {
      if (r.status === "rejected") {
        console.error(`[redirect] tracking step ${i} failed`, r.reason);
      } else if ((r.value as any)?.error) {
        console.error(
          `[redirect] tracking step ${i} error`,
          (r.value as any).error,
        );
      }
    }
  });
  void waitUntilSafe(trackingPromise);

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      "Cache-Control": "no-store",
    },
  });
}
