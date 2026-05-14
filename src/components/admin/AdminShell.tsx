import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Link2, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function AdminShell({ children }: Props) {
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div
      className="dark min-h-screen text-foreground"
      style={{
        background: "#0f0f0f",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      />
      <header
        className="sticky top-0 z-40 backdrop-blur"
        style={{
          background: "rgba(15,15,15,0.85)",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold text-white"
                style={{ background: "#6366f1" }}
              >
                C
              </div>
              <span className="text-base font-semibold tracking-tight text-white">
                CloakPanel
              </span>
            </div>
            <nav className="flex items-center gap-1 text-sm">
              <NavItem to="/admin" icon={<Link2 className="h-4 w-4" />}>
                Links
              </NavItem>
              <NavItem
                to="/admin/analytics"
                icon={<BarChart3 className="h-4 w-4" />}
              >
                Analytics
              </NavItem>
            </nav>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

function NavItem({
  to,
  icon,
  children,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
      activeProps={{
        className:
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-white",
        style: { background: "#1a1a1a", border: "1px solid #2a2a2a" },
      }}
    >
      {icon}
      {children}
    </Link>
  );
}

export const ADMIN_COLORS = {
  bg: "#0f0f0f",
  card: "#1a1a1a",
  border: "#2a2a2a",
  primary: "#6366f1",
  success: "#22c55e",
  warning: "#eab308",
  danger: "#ef4444",
};

export function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "🌐";
  const cc = code.toUpperCase();
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)),
  );
}
