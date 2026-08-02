/**
 * Classificação operacional do tempo de redirecionamento.
 * Os limites ficam centralizados aqui para poderem ser ajustados sem
 * mexer em nenhum componente.
 */

export interface LatencyThresholds {
  /** Abaixo deste valor (ms) → Excelente */
  excellent: number;
  /** Abaixo deste valor (ms) → Bom */
  good: number;
  /** Abaixo deste valor (ms) → Atenção; acima → Lento */
  attention: number;
}

export const LATENCY_THRESHOLDS: LatencyThresholds = {
  excellent: 150,
  good: 300,
  attention: 600,
};

export type LatencyGrade = "excellent" | "good" | "attention" | "slow" | "unknown";

export interface LatencyRating {
  grade: LatencyGrade;
  /** Rótulo em português, pronto para exibição. */
  label: string;
  /** Classe de cor do texto. */
  className: string;
  /** Classe de cor do ponto/indicador. */
  dot: string;
}

const META: Record<LatencyGrade, Omit<LatencyRating, "grade">> = {
  excellent: { label: "Excelente", className: "text-primary", dot: "bg-primary" },
  good: { label: "Bom", className: "text-primary/80", dot: "bg-primary/70" },
  attention: { label: "Atenção", className: "text-warning", dot: "bg-warning" },
  slow: { label: "Lento", className: "text-destructive", dot: "bg-destructive" },
  unknown: { label: "Sem dados", className: "text-muted-foreground", dot: "bg-muted-foreground" },
};

export function rateLatency(
  ms: number | null | undefined,
  t: LatencyThresholds = LATENCY_THRESHOLDS,
): LatencyRating {
  if (!ms || ms <= 0) return { grade: "unknown", ...META.unknown };
  if (ms < t.excellent) return { grade: "excellent", ...META.excellent };
  if (ms < t.good) return { grade: "good", ...META.good };
  if (ms < t.attention) return { grade: "attention", ...META.attention };
  return { grade: "slow", ...META.slow };
}
