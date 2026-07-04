import { createFileRoute } from "@tanstack/react-router";
import { handleRedirect, purgeSlugCache } from "@/lib/redirect-handler";

// Bare-domain redirect: /$slug mirrors /r/$slug so both entry points work.
export const Route = createFileRoute("/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleRedirect(request, params.slug),
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
