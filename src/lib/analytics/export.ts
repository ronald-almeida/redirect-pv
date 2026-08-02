/**
 * Arquitetura de exportação do Analytics.
 *
 * Fase 6: apenas a ARQUITETURA. Nenhum formato está implementado ainda —
 * `exportAnalytics` lança `NotImplemented` de propósito. Para habilitar um
 * formato, basta registrar o handler correspondente em `EXPORT_HANDLERS`;
 * nenhuma tela precisa ser alterada.
 */
import type { AnalyticsOverview, DomainAnalytics, LinkAnalytics, MonthlyReport } from "./model";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "csv", label: "CSV", hint: "Planilha simples" },
  { id: "xlsx", label: "Excel", hint: "Pasta de trabalho" },
  { id: "pdf", label: "PDF", hint: "Relatório impresso" },
];

/** Tudo que um exportador precisa — desacoplado dos componentes. */
export interface AnalyticsSnapshot {
  periodLabel: string;
  overview: AnalyticsOverview;
  domains: DomainAnalytics[];
  links: LinkAnalytics[];
  monthly: MonthlyReport;
}

export type ExportHandler = (snapshot: AnalyticsSnapshot) => Promise<Blob>;

/** Registro de handlers. Vazio enquanto a exportação não for liberada. */
export const EXPORT_HANDLERS: Partial<Record<ExportFormat, ExportHandler>> = {};

export function isExportAvailable(format: ExportFormat): boolean {
  return typeof EXPORT_HANDLERS[format] === "function";
}

export async function exportAnalytics(
  format: ExportFormat,
  snapshot: AnalyticsSnapshot,
): Promise<Blob> {
  const handler = EXPORT_HANDLERS[format];
  if (!handler) throw new Error(`Exportação em ${format.toUpperCase()} ainda não disponível.`);
  return handler(snapshot);
}
