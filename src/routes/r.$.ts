import { createFileRoute } from "@tanstack/react-router";
import { handleRedirect } from "@/lib/redirect-handler";

export const Route = createFileRoute("/r/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleRedirect(request, (params as { _splat?: string })._splat ?? ""),
    },
  },
});
