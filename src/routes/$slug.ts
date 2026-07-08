import { createFileRoute } from "@tanstack/react-router";
import { handleRedirect } from "@/lib/redirect-handler";

// Bare-domain redirect: /$slug mirrors /r/$slug so both entry points work.
export const Route = createFileRoute("/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleRedirect(request, params.slug),
    },
  },
});
