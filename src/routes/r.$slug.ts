import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/r/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const destination = new URL(
          `/r/${encodeURIComponent(params.slug)}`,
          "https://birgredi.shop",
        );
        // Preserve all original query parameters
        url.searchParams.forEach((value, key) => {
          destination.searchParams.set(key, value);
        });
        return Response.redirect(destination.toString(), 301);
      },
    },
  },
});
