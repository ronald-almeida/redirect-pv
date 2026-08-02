/**
 * Alertas operacionais do Dashboard.
 *
 * Combina os alertas gravados no banco (`alerts`) com alertas derivados do
 * estado atual de links e domínios. Nada aqui altera dados — é somente
 * leitura e classificação.
 */
import type { AlertRow, DomainRow, LinkRow } from "@/lib/bigcloak";
import { linkTitle } from "@/lib/bigcloak";
import { LATENCY_THRESHOLDS } from "@/lib/latency-rating";

export type AlertLevel = "critical" | "warning" | "info";

export interface DashboardAlert {
  id: string;
  level: AlertLevel;
  title: string;
  description: string;
  /** Rota de resolução dentro do painel. */
  actionTo: "/admin/slugs" | "/admin/domains" | "/admin/latency" | "/admin/events";
  actionLabel: string;
  /** Alertas derivados podem ser dispensados apenas na sessão. */
  dismissible: boolean;
  /** Presente quando o alerta veio da tabela `alerts`. */
  rowId?: string;
}

export const ALERT_LEVEL_ORDER: Record<AlertLevel, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const LEVEL_FROM_SEVERITY: Record<string, AlertLevel> = {
  critical: "critical",
  error: "critical",
  high: "critical",
  warning: "warning",
  warn: "warning",
  medium: "warning",
  info: "info",
  low: "info",
};

/** Configuração dos gatilhos derivados — ajustável sem tocar na UI. */
export const ALERT_RULES = {
  /** Cliques em espera a partir dos quais o link vira alerta crítico. */
  waitingClicksCritical: 20,
  /** Cliques em espera a partir dos quais vira aviso. */
  waitingClicksWarning: 5,
  /** Latência média (ms) acima da qual o link é sinalizado. */
  slowLinkMs: LATENCY_THRESHOLDS.attention,
};

function isValidUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const parsed = new URL(u.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export interface DeriveInput {
  links: LinkRow[];
  domains: DomainRow[];
  alerts: AlertRow[];
  /** Cliques por link dentro da janela recente. */
  waitingClicksByLink: Map<string, number>;
}

export function buildDashboardAlerts({
  links,
  domains,
  alerts,
  waitingClicksByLink,
}: DeriveInput): DashboardAlert[] {
  const out: DashboardAlert[] = [];
  const live = links.filter((l) => !l.archived_at);

  for (const l of live) {
    const waitingHits = waitingClicksByLink.get(l.id) ?? 0;
    const inWaiting = l.mode !== "real";

    if (inWaiting && waitingHits >= ALERT_RULES.waitingClicksWarning) {
      out.push({
        id: `waiting-traffic-${l.id}`,
        level:
          waitingHits >= ALERT_RULES.waitingClicksCritical ? "critical" : "warning",
        title: `${linkTitle(l)} está em espera recebendo acessos`,
        description: `${waitingHits} acessos caíram na página de espera. Ative o link para redirecionar os clientes.`,
        actionTo: "/admin/slugs",
        actionLabel: "Ativar link",
        dismissible: true,
      });
      continue;
    }

    if (inWaiting && isValidUrl(l.real_url)) {
      out.push({
        id: `ready-not-active-${l.id}`,
        level: "warning",
        title: `${linkTitle(l)} tem destino configurado mas não está ativo`,
        description: "O destino já está preenchido. Basta ativar para começar a redirecionar.",
        actionTo: "/admin/slugs",
        actionLabel: "Ativar link",
        dismissible: true,
      });
      continue;
    }

    if (l.mode === "real" && l.real_url && !isValidUrl(l.real_url)) {
      out.push({
        id: `invalid-url-${l.id}`,
        level: "critical",
        title: `${linkTitle(l)} está com URL de destino inválida`,
        description: "O endereço salvo não é uma URL válida. Corrija para evitar falhas no redirecionamento.",
        actionTo: "/admin/slugs",
        actionLabel: "Corrigir destino",
        dismissible: false,
      });
      continue;
    }

    if ((l.avg_redirect_ms ?? 0) > ALERT_RULES.slowLinkMs) {
      out.push({
        id: `slow-${l.id}`,
        level: "warning",
        title: `${linkTitle(l)} está redirecionando devagar`,
        description: `Tempo médio de ${l.avg_redirect_ms} ms, acima do esperado.`,
        actionTo: "/admin/latency",
        actionLabel: "Ver latência",
        dismissible: true,
      });
    }
  }

  for (const d of domains) {
    if (d.archived_at) continue;
    if (!d.active) {
      out.push({
        id: `domain-off-${d.id}`,
        level: "critical",
        title: `Domínio ${d.domain} está indisponível`,
        description: "O domínio está desativado e não responde aos redirecionamentos.",
        actionTo: "/admin/domains",
        actionLabel: "Ver domínio",
        dismissible: false,
      });
      continue;
    }
    const dns = (d.cf_dns_status !== "unknown" ? d.cf_dns_status : d.dns_status) ?? "";
    const worker = (d.cf_worker_status !== "unknown" ? d.cf_worker_status : d.worker_status) ?? "";
    const bad = ["error", "erro", "offline", "failed", "invalid", "down"];
    if (bad.includes(dns.toLowerCase()) || bad.includes(worker.toLowerCase())) {
      out.push({
        id: `domain-cfg-${d.id}`,
        level: "warning",
        title: `Domínio ${d.domain} com configuração com erro`,
        description: "A verificação de DNS ou Worker retornou erro. Revise a configuração do domínio.",
        actionTo: "/admin/domains",
        actionLabel: "Verificar domínio",
        dismissible: true,
      });
    }
  }

  for (const a of alerts) {
    out.push({
      id: `row-${a.id}`,
      rowId: a.id,
      level: LEVEL_FROM_SEVERITY[a.severity?.toLowerCase() ?? ""] ?? "info",
      title: a.title,
      description: a.detail ?? "",
      actionTo: a.domain_id ? "/admin/domains" : a.link_id ? "/admin/slugs" : "/admin/events",
      actionLabel: "Ver detalhes",
      dismissible: true,
    });
  }

  return out.sort((a, b) => ALERT_LEVEL_ORDER[a.level] - ALERT_LEVEL_ORDER[b.level]);
}
