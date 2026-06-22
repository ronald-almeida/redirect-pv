import { createFileRoute, Link } from "@tanstack/react-router";
import {
  LinkIcon,
  BarChart3,
  Gauge,
  ShieldCheck,
  ArrowRight,
  Zap,
} from "lucide-react";

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

const blocks = [
  {
    to: "/admin",
    title: "Admin",
    description: "Crie, edite e gerencie todos os seus links curtos.",
    icon: LinkIcon,
  },
  {
    to: "/admin/analytics",
    title: "Analytics",
    description: "Cliques, países, dispositivos e UTMs em tempo real.",
    icon: BarChart3,
  },
  {
    to: "/admin/latency",
    title: "Latência",
    description: "Compare a velocidade de redirecionamento antes/depois.",
    icon: Gauge,
  },
] as const;

const stats = [
  { label: "Cache edge", value: "SWR", icon: Zap },
  { label: "Tracking", value: "Async", icon: ShieldCheck },
  { label: "Redirect", value: "302", icon: ArrowRight },
];

function Index() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />

      <main className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 sm:py-16 lg:py-24">
        {/* Hero */}
        <section className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Edge redirect • &lt; 60ms
          </span>

          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Link redirector
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-balance text-base text-muted-foreground sm:text-lg">
            Acesse qualquer link curto em{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
              /r/seu-slug
            </code>
            . Gerencie, meça e otimize tudo em um só lugar.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/admin"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md sm:w-auto"
            >
              Abrir admin
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/admin/analytics"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:w-auto"
            >
              Ver analytics
            </Link>
          </div>
        </section>

        {/* Stats row */}
        <section className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-2 sm:gap-4">
          {stats.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card/50 px-2 py-3 text-center backdrop-blur sm:flex-row sm:justify-center sm:gap-2"
            >
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-none">
                  {value}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground sm:text-xs">
                  {label}
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Block grid — stack on mobile, 3 columns on desktop */}
        <section className="mt-12 grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3 lg:mt-16">
          {blocks.map(({ to, title, description, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                  background:
                    "radial-gradient(80% 60% at 50% 0%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 70%)",
                }}
              />
              <div className="relative flex items-center justify-between">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <div className="relative">
                <h3 className="text-base font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            </Link>
          ))}
        </section>

        <footer className="mt-16 text-center text-xs text-muted-foreground">
          Powered by edge cache • Stale-while-revalidate • Cloudflare Workers
        </footer>
      </main>
    </div>
  );
}
