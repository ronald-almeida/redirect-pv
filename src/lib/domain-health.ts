/**
 * Saúde de domínio — Big Cloak.
 *
 * Hoje a saúde é derivada apenas dos dados já disponíveis no banco
 * (domínio ativo/arquivado, status DNS/Worker gravados e atividade de cliques).
 * A assinatura das funções já está preparada para, no futuro, receber os
 * dados vindos da API da Cloudflare (DNS, Worker, SSL, certificados) sem
 * quebrar nenhum consumidor.
 */
import type { DomainRow } from "@/lib/bigcloak";

export type HealthLevel = "ok" | "warning" | "offline" | "unknown";

export interface HealthCheck {
  level: HealthLevel;
  label: string;
  dot: string;
}

const LEVEL_META: Record<HealthLevel, { label: string; dot: string }> = {
  ok: { label: "Funcionando", dot: "bg-primary" },
  warning: { label: "Atenção", dot: "bg-[#F59E0B]" },
  offline: { label: "Offline", dot: "bg-destructive" },
  unknown: { label: "Sem dados", dot: "bg-muted-foreground" },
};

export function level(l: HealthLevel): HealthCheck {
  return { level: l, ...LEVEL_META[l] };
}

/** Normaliza os textos livres gravados em dns_status / worker_status / ssl. */
export function normalizeStatus(raw: string | null | undefined): HealthLevel {
  const v = (raw ?? "").toLowerCase();
  if (["ok", "ativo", "active", "connected", "conectado", "valid", "ready"].includes(v))
    return "ok";
  if (["warning", "atencao", "atenção", "pending", "pendente", "degraded"].includes(v))
    return "warning";
  if (["offline", "error", "erro", "failed", "invalid", "down"].includes(v)) return "offline";
  return "unknown";
}

export interface DomainSignals {
  /** Cliques recebidos no domínio nas últimas 24h (proxy de "está redirecionando"). */
  recentClicks: number;
  lastClickAt: string | null;
}

/** Estado geral do domínio, combinando configuração + atividade real. */
export function domainHealth(d: DomainRow, s: DomainSignals): HealthCheck {
  if (d.archived_at) return { level: "unknown", label: "Arquivado", dot: "bg-muted-foreground" };
  if (!d.active) return { level: "offline", label: "Offline", dot: "bg-destructive" };

  const dns = normalizeStatus(d.cf_dns_status !== "unknown" ? d.cf_dns_status : d.dns_status);
  const worker = normalizeStatus(
    d.cf_worker_status !== "unknown" ? d.cf_worker_status : d.worker_status,
  );
  if (dns === "offline" || worker === "offline") return level("offline");
  if (d.check_error) return level("warning");
  if (s.recentClicks > 0) return { level: "ok", label: "Online", dot: "bg-primary" };
  if (dns === "ok" && worker === "ok") return { level: "ok", label: "Online", dot: "bg-primary" };
  return level("unknown");
}

/** Cartões de status exibidos no card do domínio. */
export function domainChecks(d: DomainRow, s: DomainSignals) {
  const dnsLevel = normalizeStatus(d.cf_dns_status !== "unknown" ? d.cf_dns_status : d.dns_status);
  const workerLevel = normalizeStatus(
    d.cf_worker_status !== "unknown" ? d.cf_worker_status : d.worker_status,
  );
  const redirect: HealthLevel = s.recentClicks > 0 ? "ok" : d.active ? "unknown" : "offline";
  return [
    { key: "dns", title: "Status DNS", ...level(dnsLevel) },
    {
      key: "redirect",
      title: "Status Redirect",
      ...level(redirect),
    },
    { key: "worker", title: "Worker", ...level(workerLevel) },
    { key: "ssl", title: "SSL", ...level(normalizeStatus(d.cf_ssl_status)) },
  ];
}

/**
 * Ponto de extensão para a futura verificação automática.
 * Ainda não realiza chamadas externas — retorna o estado atual gravado.
 */
export async function refreshDomainHealth(d: DomainRow): Promise<HealthCheck> {
  return domainHealth(d, { recentClicks: 0, lastClickAt: null });
}
