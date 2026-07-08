import { createFileRoute } from "@tanstack/react-router";
import { handleRedirect } from "@/lib/redirect-handler";

export const Route = createFileRoute("/r/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleRedirect(request, params.slug),
    },
  },
});
