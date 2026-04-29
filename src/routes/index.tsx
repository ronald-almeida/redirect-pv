import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Link redirector" },
      {
        name: "description",
        content: "Simple link redirect management.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="text-5xl">🔗</div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Link redirector
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Visit any short link at <code className="font-mono">/your-slug</code>.
        </p>
        <div className="mt-8">
          <Link
            to="/admin"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open admin
          </Link>
        </div>
      </div>
    </div>
  );
}
