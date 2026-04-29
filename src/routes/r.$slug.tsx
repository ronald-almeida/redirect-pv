import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/r/$slug")({
  component: SlugPage,
});

interface LinkRow {
  slug: string;
  mode: string;
  real_url: string | null;
  decoy_url: string | null;
  page_title: string | null;
  page_message: string | null;
  page_icon: string | null;
}

function SlugPage() {
  const { slug } = Route.useParams();
  const [link, setLink] = useState<LinkRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchLink = async () => {
      const { data, error } = await supabase
        .from("links")
        .select("slug,mode,real_url,decoy_url,page_title,page_message,page_icon")
        .eq("slug", slug)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (data.mode === "real" && data.real_url) {
        window.location.replace(data.real_url);
        return;
      }
      if (data.mode === "decoy" && data.decoy_url) {
        window.location.replace(data.decoy_url);
        return;
      }

      // waiting mode → redirect to the global default waiting URL
      const { data: settings } = await supabase
        .from("settings")
        .select("default_waiting_url")
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (settings?.default_waiting_url) {
        window.location.replace(settings.default_waiting_url);
        return;
      }

      setLink(data);
      setLoading(false);
    };

    fetchLink();
    const interval = setInterval(fetchLink, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <div className="text-5xl">🔗</div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Link not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link doesn't exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="text-6xl" aria-hidden>
          {link?.page_icon ?? "⏳"}
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
          {link?.page_title ?? "Link coming soon"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {link?.page_message ?? "This link is being set up. Check back soon."}
        </p>
        <div className="mt-8 flex justify-center">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70"
            aria-label="Checking for updates"
          />
        </div>
        <p className="mt-4 text-xs text-muted-foreground/70">
          Auto-refreshing every 30 seconds…
        </p>
      </div>
    </div>
  );
}
