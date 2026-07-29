import { createFileRoute } from "@tanstack/react-router";
import { handleRedirect } from "@/lib/redirect-handler";

// Bare-domain redirect: splat so slugs with /, ., =, ? are matched.
export const Route = createFileRoute("/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleRedirect(request, (params as { _splat?: string })._splat ?? ""),
    },
  },
});
