import { createFileRoute } from "@tanstack/react-router";

/**
 * Health check público — usado pelo painel para validar se um domínio
 * cadastrado está realmente servindo o Worker do Big Cloak.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { service: "big-cloak", ok: true, ts: Date.now() },
          {
            headers: {
              "Cache-Control": "no-store",
              "Access-Control-Allow-Origin": "*",
            },
          },
        ),
    },
  },
});
