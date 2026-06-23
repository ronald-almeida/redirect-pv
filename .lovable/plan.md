
# Redesign CloakPanel — SaaS Premium

Vou refazer toda a interface de administração com qualidade visual de Linear/Vercel/Stripe, mantendo 100% da lógica operacional existente (redirect handler, cache, latency tracking, supabase) — só mudo a camada de apresentação.

## Arquitetura de rotas

```text
src/routes/
  __root.tsx              → mantém shell
  _admin.tsx              → layout NOVO com sidebar + topbar (auth gate)
  _admin.index.tsx        → /admin (Links, era admin.tsx)
  _admin.analytics.tsx    → /admin/analytics (redesenhado)
  _admin.latency.tsx      → /admin/latency (redesenhado)
  _admin.events.tsx       → /admin/events (NOVO)
  _admin.settings.tsx     → /admin/settings (NOVO, abas)
```

Os arquivos antigos `admin.tsx`, `admin.analytics.tsx`, `admin.latency.tsx` serão substituídos. Removo o header duplicado em cada página — tudo passa pelo layout `_admin.tsx`.

## Componentes novos (src/components/admin/)

- `AdminSidebar.tsx` — sidebar fixa, dark, 5 itens (Links, Analytics, Latência, Eventos, Configurações), ativo via `useRouterState`.
- `AdminTopbar.tsx` — título da página, badge de ambiente (Production/Preview), busca global, seletor de período (7d/30d/90d), avatar admin com dropdown (Sair).
- `MetricCard.tsx` — card de métrica com valor grande, delta %, ícone, sparkline (Recharts `<Line>` minimal, sem eixos).
- `LinksTable.tsx` — tabela estilo Linear: linhas compactas, slug em destaque + descrição, badges de Status/Tipo/Cache, ações no hover (copiar, abrir, editar, duplicar, analytics, excluir via dropdown).
- `Badge` variants — adiciono variantes semânticas no shadcn badge: `active`, `paused`, `waiting`, `real`, `decoy`, `mem`, `hit`, `stale`, `miss`.
- `Sparkline.tsx` — wrapper minimal Recharts.

## Páginas

**Links (`/admin`)** — 4 MetricCards (Total Cliques, Latência Média, Slugs Ativos, Taxa Sucesso) com sparkline derivado de `clicks` + `latency_samples`. Abaixo, `LinksTable` substitui o grid de cards atual. Mantém modal de criar/editar link e toda a lógica do `admin.tsx` atual.

**Analytics (`/admin/analytics`)** — grid de blocos: Volume de Cliques (área), Latência ao longo do tempo (linha multi-série p50/p95), Distribuição por tipo (donut real/isca/espera), Taxa de Sucesso (gauge/big number), Evolução diária (barras), Top Slugs (lista ranqueada). Tudo via Recharts já instalado.

**Latência (`/admin/latency`)** — dashboard técnico: 6 stat tiles (p50, p95, p99, média, melhor, pior), gráfico Latência por Hora, gráfico empilhado por cache status, linha de cache hit ratio, 4 cards destaque MEM/HIT/STALE/MISS com contagem + percentual + p95 individual. Usa o RPC/query de `latency_samples` já existente.

**Eventos (`/admin/events`)** — nova tabela derivada das fontes que JÁ existem: `clicks` (redirect realizado, 404 quando link não existe), `links` updates via `updated_at` vs `created_at` (criado/editado), `latency_samples` outliers. **Não invento eventos fictícios** — só agrego o que está no banco. Colunas: Data/Hora, Evento, Slug, Tipo, Detalhes. Filtros por tipo de evento e busca por slug. Coluna "Usuário" exibe "system" para eventos automáticos (não há multi-user no projeto).

**Configurações (`/admin/settings`)** — Tabs shadcn:
- **Geral**: nome do painel, fuso horário (read-only do browser), tema (forçado dark, informativo).
- **Redirect**: URL de fallback global, comportamento default (real/isca/espera) — lê/escreve em `app_settings` se existir; se não existir, mostra os valores read-only do código com aviso.
- **Cache**: TTL atual (do código), botão "Limpar cache" (chama `purgeSlugCache` global via server fn).
- **Segurança**: lista de admins (linha única do usuário atual via `supabase.auth.getUser`), botão sair.
- **Analytics**: retenção atual de `clicks` e `latency_samples` (informativo, lê configuração existente).

Se uma aba não tiver dado real para mostrar, exibo placeholder "Sem configuração disponível neste ambiente" — não invento controles.

## Design tokens (src/styles.css)

Sobrescrevo `.dark` (já é o tema único):
- `--background: #0A0A0A`
- `--card: #0F0F10` com `border: #1C1C1F`
- `--muted-foreground: #6B6B70`
- `--primary: #FAFAFA` (texto/CTA primário branco, estilo Linear)
- accent indigo `#6366F1` só em sparklines/gráficos
- raio `--radius: 0.625rem`
- shadow elegante `--shadow-card: 0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)`

Tipografia: mantenho stack atual (system), aplico `font-feature-settings: "ss01","cv11"` e `tracking-tight` em headings.

## Lógica preservada (não toco)

- `src/lib/redirect-handler.ts` (hot path)
- `src/routes/r.$slug.ts`
- `src/integrations/supabase/*`
- Esquema do banco e migrations
- Auth flow

## Critério de pronto

- 5 rotas admin renderizam com sidebar + topbar consistentes
- Tabela de Links mostra dados reais com badges e ações funcionais (copiar, abrir, editar, duplicar, excluir)
- 4 métricas no topo com sparklines vindos do banco
- Páginas Analytics e Latência mostram gráficos com dados reais (sem mocks)
- Eventos e Configurações só expõem dados que existem; sem campos fictícios
- Build passa, dark mode coerente, sem cor hardcoded em componentes

## Fora de escopo

- Mudanças no redirect handler ou no cache (já passou pela auditoria de performance)
- Onboarding, planos, billing, integrações, domínios — todos removidos da UI
- Multi-tenant / multi-user

Aprovação para implementar?
