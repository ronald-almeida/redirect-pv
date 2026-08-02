/**
 * Formatadores compartilhados do painel Big Cloak.
 * Fonte única — nada de reimplementar `formatRel` dentro de rotas.
 */

/** Número no padrão pt-BR. */
export function nf(n: number): string {
  return n.toLocaleString("pt-BR");
}

/** Tempo relativo compacto: "agora", "12m", "3h", "5d". */
export function formatRel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "agora";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Hora cheia HH:MM:SS. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Data + hora curta DD/MM HH:MM. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Classificação operacional da latência de redirecionamento. */
export function latencyTone(ms: number): { label: string; className: string } {
  if (!ms) return { label: "—", className: "text-muted-foreground" };
  if (ms < 100) return { label: "Ótimo", className: "text-primary" };
  if (ms < 300) return { label: "Normal", className: "text-[#F59E0B]" };
  return { label: "Lento", className: "text-destructive" };
}

/** Percentual com uma casa decimal. */
export function pct(part: number, total: number): string {
  if (!total) return "0.0";
  return ((part / total) * 100).toFixed(1);
}
