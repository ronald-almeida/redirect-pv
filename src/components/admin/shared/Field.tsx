import { Label } from "@/components/ui/label";

/** Rótulo padronizado dos formulários do painel. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
