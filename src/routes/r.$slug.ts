import { createFileRoute } from "@tanstack/react-router";
import { handleRedirect } from "@/lib/redirect-handler";

export const Route = createFileRoute("/r/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const host = request.headers.get("host")?.split(":")[0] || "";

        if (host !== "birgredi.shop") {
          const url = new URL(request.url);
          const destination = new URL(
            `/r/${encodeURIComponent(params.slug)}`,
            "https://birgredi.shop",
          );
          destination.search = url.search;
          return Response.redirect(destination.toString(), 301);
        }

        return handleRedirect(request, params.slug);
      },
    },
  },
});
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
