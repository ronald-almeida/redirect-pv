import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SlidersHorizontal, Database, ShieldCheck, BarChart3, Settings as Cog,
  LogOut, Trash2, RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Configurações · CloakPanel" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [defaultWaitingUrl, setDefaultWaitingUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    supabase.from("settings").select("id, default_waiting_url").limit(1).maybeSingle().then(({ data }) => {
      if (data) {
        setSettingsId(data.id);
        setDefaultWaitingUrl(data.default_waiting_url ?? "");
      }
    });
  }, []);

  async function saveWaiting() {
    if (!settingsId) return;
    setSaving(true);
    const { error } = await supabase.from("settings").update({ default_waiting_url: defaultWaitingUrl.trim() }).eq("id", settingsId);
    setSaving(false);
    if (error) alert(error.message);
  }

  async function purgeAllCache() {
    if (!confirm("Limpar o cache de todos os slugs?")) return;
    setPurging(true);
    try {
      const { data } = await supabase.from("links").select("slug");
      await Promise.all(((data ?? []) as { slug: string }[]).map((l) =>
        fetch(`/r/${encodeURIComponent(l.slug)}`, { method: "DELETE" }).catch(() => {})
      ));
    } finally { setPurging(false); }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "—";

  return (
    <AdminShell>
      <div className="px-4 md:px-6 py-6">
        <Tabs defaultValue="general" className="space-y-5">
          <TabsList className="bg-card border border-border h-9 p-0.5">
            <TabsTrigger value="general"  className="gap-1.5 text-[12.5px] data-[state=active]:bg-secondary"><Cog className="h-3.5 w-3.5" />Geral</TabsTrigger>
            <TabsTrigger value="redirect" className="gap-1.5 text-[12.5px] data-[state=active]:bg-secondary"><SlidersHorizontal className="h-3.5 w-3.5" />Redirecionamento</TabsTrigger>
            <TabsTrigger value="cache"    className="gap-1.5 text-[12.5px] data-[state=active]:bg-secondary"><Database className="h-3.5 w-3.5" />Cache</TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5 text-[12.5px] data-[state=active]:bg-secondary"><ShieldCheck className="h-3.5 w-3.5" />Segurança</TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 text-[12.5px] data-[state=active]:bg-secondary"><BarChart3 className="h-3.5 w-3.5" />Analytics</TabsTrigger>
          </TabsList>

          {/* GERAL */}
          <TabsContent value="general" className="space-y-3">
            <Section title="Identidade" desc="Informações exibidas no painel.">
              <Row label="Nome do painel" value="CloakPanel" />
              <Row label="Ambiente" value={typeof window !== "undefined" && !/preview|localhost/.test(window.location.host) ? "Production" : "Preview"} />
              <Row label="Host" value={typeof window !== "undefined" ? window.location.host : "—"} />
              <Row label="Fuso horário" value={tz} />
              <Row label="Tema" value="Dark (fixo)" />
            </Section>
          </TabsContent>

          {/* REDIRECT */}
          <TabsContent value="redirect" className="space-y-3">
            <Section title="Destino padrão de espera" desc="URL usada quando um link está em modo Espera e não tem destino próprio.">
              <div className="space-y-2 max-w-xl">
                <Label htmlFor="dwu" className="text-[10.5px] uppercase tracking-wider text-muted-foreground">URL de espera</Label>
                <Input
                  id="dwu"
                  type="url"
                  value={defaultWaitingUrl}
                  onChange={(e) => setDefaultWaitingUrl(e.target.value)}
                  onBlur={() => void saveWaiting()}
                  disabled={!settingsId || saving}
                  placeholder="https://exemplo.com"
                />
                <p className="text-[11px] text-muted-foreground">{saving ? "Salvando…" : "Salva automaticamente ao sair do campo."}</p>
              </div>
            </Section>

            <Section title="Comportamento do redirecionamento" desc="Valores fixos do caminho rápido (não editáveis em runtime).">
              <Row label="Tipo de resposta" value="Redirecionamento 302 imediato" />
              <Row label="Controle de cache" value="no-store (navegador) / público 86400s (cache interno)" mono />
              <Row label="Server-Timing" value="redirect;dur=&lt;ms&gt; — base para a latência real" mono />
              <Row label="Rastreamento" value="fetch keepalive em segundo plano (não bloqueia o 302)" />
            </Section>
          </TabsContent>

          {/* CACHE */}
          <TabsContent value="cache" className="space-y-3">
            <Section title="Estratégia de cache" desc="Configuração interna do redirecionador.">
              <Row label="Camada em memória" value="Isolate em memória · TTL ~30s" />
              <Row label="Camada de borda" value="TTL 24h · chave por hostname da zona" mono />
              <Row label="Revalidação" value="SWR — entrega imediata e atualização em segundo plano" />
              <Row label="Cache" value="Desativado — leitura direta do banco em cada request" mono />
            </Section>
            <Section title="Limpeza global" desc="Força refresh de todos os slugs imediatamente.">
              <Button variant="outline" onClick={() => void purgeAllCache()} disabled={purging} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${purging ? "animate-spin" : ""}`} />
                {purging ? "Limpando…" : "Limpar cache de todos os slugs"}
              </Button>
            </Section>
          </TabsContent>

          {/* SECURITY */}
          <TabsContent value="security" className="space-y-3">
            <Section title="Sessão" desc="Você está autenticado neste painel.">
              <div className="rounded-md border border-border bg-secondary/40 p-3 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 border border-border text-sm font-semibold">
                  {(email[0] || "A").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{email || "Administrador"}</div>
                  <div className="text-[11px] text-muted-foreground">Operador · sessão ativa</div>
                </div>
                <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 text-destructive hover:text-destructive">
                  <LogOut className="h-3.5 w-3.5" /> Sair
                </Button>
              </div>
            </Section>
            <Section title="Políticas" desc="Configuração de acesso ao painel.">
              <Row label="Autenticação" value="E-mail + senha · Lovable Cloud (Supabase Auth)" />
              <Row label="Rotas protegidas" value="/admin/* requerem sessão válida" mono />
              <Row label="Cadastro aberto" value="Desabilitado" />
            </Section>
          </TabsContent>

          {/* ANALYTICS */}
          <TabsContent value="analytics" className="space-y-3">
            <Section title="Coleta" desc="Como os cliques são armazenados.">
              <Row label="Fonte" value="Tabela de cliques (registro em segundo plano no caminho rápido)" mono />
              <Row label="Campos" value="link_id, mode_at_click, cache_status, redirect_ms, country, device, utm_*" mono />
              <Row label="Filtros" value="Bots e prefetch são ignorados antes do registro" />
            </Section>
            <Section title="Retenção" desc="Política atual (informativa).">
              <Row label="Cliques" value="Sem expiração automática · limpeza manual" />
              <Row label="Configurações" value="Linha única · sem versionamento" />
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </AdminShell>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-[14px] font-semibold tracking-tight">{title}</h3>
        {desc && <p className="mt-0.5 text-[12px] text-muted-foreground">{desc}</p>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-center gap-4 border-t border-border first:border-t-0 py-2.5 text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-[12px]" : ""} dangerouslySetInnerHTML={{ __html: value }} />
    </div>
  );
}
