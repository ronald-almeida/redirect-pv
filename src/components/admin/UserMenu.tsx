import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function useAccount() {
  const [email, setEmail] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);
  const name = email ? email.split("@")[0] : "Operador";
  const initials = (email || "BC").slice(0, 2).toUpperCase();
  return { email, name, initials };
}

export async function signOutAccount() {
  await supabase.auth.signOut();
}

/** Único ponto de acesso à conta. Use `variant="inline"` para listas/menus. */
export function UserMenu({
  onSignOut,
  className,
  align = "start",
  side = "top",
}: {
  onSignOut: () => void;
  className?: string;
  align?: "start" | "end";
  side?: "top" | "bottom";
}) {
  const { name, initials } = useAccount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[10px] border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2 text-left outline-none transition-colors hover:bg-sidebar-accent",
          className,
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[11px] font-semibold text-foreground">
          {initials}
        </div>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className="w-52">
        <DropdownMenuItem asChild>
          <Link to="/admin/settings">
            <Settings className="h-3.5 w-3.5" />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
