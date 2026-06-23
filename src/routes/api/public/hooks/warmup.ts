import { createFileRoute } from "@tanstack/react-router";

// Pings the top active slugs to keep the edge cache and isolate memory warm.
// Called by pg_cron every few minutes. Does NOT count as real clicks because
// the redirect handler skips tracking when the User-Agent matches BOT_REGEX
// (we send "warmup-bot" below).
export const Route = createFileRoute("/api/public/hooks/warmup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const supabaseUrl = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        // 1. Fetch top active slugs (cap to keep the job cheap).
        const listRes = await fetch(
          `${supabaseUrl}/rest/v1/links?select=slug&active=eq.true&order=click_count.desc&limit=100`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Accept: "application/json",
            },
          },
        );

        if (!listRes.ok) {
          return Response.json(
            { ok: false, error: `links query failed: ${listRes.status}` },
            { status: 500 },
          );
        }

        const rows = (await listRes.json()) as Array<{ slug: string }>;
        const slugs = rows.map((r) => r.slug).filter(Boolean);

        // 2. Fire the redirect handler for each slug from the SAME host that
        //    real visitors hit, so the warmup populates the exact same edge
        //    cache namespace they'll read from.
        const origin = new URL(request.url).origin;
        const results = await Promise.allSettled(
          slugs.map((slug) =>
            fetch(`${origin}/r/${encodeURIComponent(slug)}`, {
              method: "GET",
              redirect: "manual",
              headers: {
                // BOT_REGEX matches "bot" — keeps these out of click tracking.
                "User-Agent": "warmup-bot/1.0",
              },
            }),
          ),
        );

        const ok = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.length - ok;

        return Response.json({
          ok: true,
          warmed: ok,
          failed,
          total: slugs.length,
          ms: Date.now() - startedAt,
        });
      },
    },
  },
});
