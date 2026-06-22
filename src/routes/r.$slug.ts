import { createFileRoute } from "@tanstack/react-router";
import { handleRedirect } from "@/lib/redirect-handler";

export const Route = createFileRoute("/r/$slug")({
  server: {
    handlers: {
      // No host rewrite — serve the redirect on whichever host the client hit.
      // The previous 301 to birgredi.shop added a full extra round-trip
      // (~200-400ms) for every visit from any other host.
      GET: async ({ request, params }) => handleRedirect(request, params.slug),
    },
  },
});
