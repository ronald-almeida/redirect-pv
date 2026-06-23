import { cn } from "@/lib/utils";

type Kind =
  | "active" | "paused" | "waiting"
  | "real" | "decoy"
  | "MEM" | "HIT" | "STALE" | "MISS";

const STYLES: Record<Kind, string> = {
  active:  "bg-primary/12 text-primary border-primary/30",
  paused:  "bg-muted text-muted-foreground border-border",
  waiting: "bg-[#A78BFA]/12 text-[#A78BFA] border-[#A78BFA]/30",
  real:    "bg-primary/12 text-primary border-primary/30",
  decoy:   "bg-[#F59E0B]/12 text-[#F59E0B] border-[#F59E0B]/30",
  MEM:     "bg-primary/12 text-primary border-primary/30",
  HIT:     "bg-sky-500/12 text-sky-400 border-sky-500/30",
  STALE:   "bg-amber-500/12 text-amber-400 border-amber-500/30",
  MISS:    "bg-rose-500/12 text-rose-400 border-rose-500/30",
};

const DOT: Partial<Record<Kind, string>> = {
  active: "bg-primary",
  paused: "bg-muted-foreground",
  waiting: "bg-[#A78BFA]",
  MEM: "bg-primary",
  HIT: "bg-sky-400",
  STALE: "bg-amber-400",
  MISS: "bg-rose-400",
};

export function StatusBadge({ kind, label, dot, className }: { kind: Kind; label?: string; dot?: boolean; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wider",
      STYLES[kind],
      className,
    )}>
      {dot && DOT[kind] && <span className={cn("h-1.5 w-1.5 rounded-full", DOT[kind])} />}
      {label ?? kind}
    </span>
  );
}
