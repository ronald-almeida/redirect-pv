import { createFileRoute } from "@tanstack/react-router";
import { handleRedirect, purgeSlugCache } from "@/lib/redirect-handler";

export const Route = createFileRoute("/r/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleRedirect(request, params.slug),
      // Cache purge — called by the admin panel after a link is updated so
      // changes propagate within seconds instead of waiting for the 30s TTL.
      DELETE: async ({ params }) => {
        const purged = await purgeSlugCache(params.slug);
        return Response.json(
          { ok: true, purged, slug: params.slug },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
