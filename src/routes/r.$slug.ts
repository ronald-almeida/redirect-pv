import { createFileRoute } from "@tanstack/react-router";
import { handleRedirect, purgeSlugCache } from "@/lib/redirect-handler";

export const Route = createFileRoute("/r/$slug")({
  server: {
    handlers: {
      // [HOT PATH] Public redirect endpoint.
      // Returns a 302 with Location; all tracking is deferred via waitUntil.
      GET: async ({ request, params }) => handleRedirect(request, params.slug),

      // Cache invalidation hook. Called by the admin UI after create/edit/delete
      // to invalidate the edge + isolate cache immediately, without waiting for TTL.
      // No auth here on purpose — it only purges a single slug's cache entry.
      DELETE: async ({ request, params }) => {
        const ok = await purgeSlugCache(params.slug, request);
        return new Response(JSON.stringify({ purged: ok }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
