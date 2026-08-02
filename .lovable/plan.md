
# Big Cloak — Refatoração Estrutural (Plano em 6 Fases)

Preservação absoluta do back-end, banco, edge functions, slugs em produção, tabelas, RLS e do handler `/lib/redirect-handler.ts`. Toda mudança é no front, na organização de componentes e na experiência.

## Identidade visual (aplicada a partir da Fase 2)

- Fundo `#0A0A0A`, primária `#13C286`, superfícies `#111111`/`#161616`, bordas `rgba(255,255,255,0.06)`.
- Tipografia: Geist Sans (UI) + Geist Mono (dados/slugs), via `<link>` em `__root.tsx`.
- Tokens registrados em `src/styles.css` (`@theme inline`) — nada de cor hardcoded nos componentes.
- Transições 150–200ms, skeletons, cantos 10–14px, sombras discretas.

## Arquitetura-alvo de pastas

```text
src/
  components/
    ui/                     (shadcn — intocado)
    admin/
      shell/                AppShell, TopBar, MobileTabBar, PageHeader
      dashboard/            KpiCard, LiveClicks, DomainHealth, ActivityFeed
      slugs/                SlugList, SlugRow, SlugSheet, SlugStatusPill, ModeToggle
      domains/              DomainCard, DomainStatus, AddDomainSheet
      events/               EventsTable, EventRow, EventsFilterBar
      shared/               EmptyState, StatDelta, CopyButton, RelativeTime, LoadingSkeleton
  hooks/
    use-links.ts            react-query wrappers (list/create/update/archive)
    use-domains.ts
    use-clicks.ts           realtime + paged
    use-admin-period.ts     (já existe: consolidar)
    use-copy.ts, use-toast-shortcut.ts, use-hotkeys.ts
  lib/
    bigcloak.ts             (mantém — tipos/helpers)
    redirect-handler.ts     (intocado)
    supabase/queries/       links.ts, domains.ts, clicks.ts, alerts.ts
    format.ts               nf, formatRel, formatClock, latencyTone (movidos de bigcloak)
  routes/
    admin.tsx               (só layout + <Outlet/>)
    admin.index.tsx         Dashboard (fino, ~150 linhas)
    admin.slugs.tsx         (novo — hoje mora dentro do admin.index)
    admin.domains.tsx       (fino)
    admin.events.tsx        (fino)
    admin.analytics.tsx     (fino)
    admin.latency.tsx       (fino)
    admin.settings.tsx      (fino)
```

## Fase 1 — Arquitetura e Refatoração (essa entrega)

Objetivo: quebrar os monólitos e preparar o terreno. **Zero mudança visual perceptível** — só reorganização e correções.

1. **Corrigir o erro "Duplicate routes found with id: /"** que aparece no runtime (500 em `/`). Investigar `$.ts` vs `index.tsx` e ajustar sem quebrar o splat de redirect.
2. **Quebrar `src/routes/admin.index.tsx` (1002 linhas)** em:
   - `admin.index.tsx` → só orquestra Dashboard (KPIs + feed + alerts).
   - `admin.slugs.tsx` → nova rota dedicada à lista/gestão de slugs.
   - Componentes extraídos: `SlugList`, `SlugRow`, `SlugSheet` (create/edit), `ModeToggle`, `SlugStatusPill`, `CopyLinkButton`, `KpiCard`, `LiveClicksTicker`, `AlertBanner`.
3. **Camada de dados** (`src/lib/supabase/queries/*`): centralizar todas as queries Supabase hoje espalhadas nas rotas. Rotas passam a chamar hooks (`useLinks`, `useDomains`, `useClicksFeed`), não `supabase.from(...)` direto.
4. **React Query já está instalado** — padronizar `useQuery`/`useMutation` com invalidação correta; matar `useEffect(() => fetch...)` das rotas admin.
5. **Realtime**: extrair a subscription do `admin.index` para `useLinksRealtime()` reutilizável (mantém o pulse verde).
6. **Sidebar sem "Isca"** — confirmar remoção completa (rota e labels) e checar `AdminShell` (já OK).
7. **Consolidar duplicações**:
   - Formatadores em `src/lib/format.ts` (retirando de `bigcloak.ts`).
   - Um único `StatusBadge`, `CopyButton`, `EmptyState`, `RelativeTime`.
   - Remover código morto (analytics duplicados, imports não usados).
8. **Correções de bugs conhecidos**:
   - Slug duplicada: validação `unique(slug, domain_id)` no formulário (checa antes de submeter) + toast claro no erro Postgres 23505.
   - `admin.tsx` layout mais fino — só shell + outlet.
9. **Perf leve** (sem redesenhar):
   - `React.memo` em `SlugRow`, `EventRow`.
   - `useMemo` nas listas filtradas.
   - Code-split das rotas pesadas via TanStack (já é automático — confirmar que componentes não são exportados).
   - `staleTime` de 30s nos queries de contagem.
10. **Validação de não-regressão** ao final da Fase 1:
    - Build + typecheck limpo.
    - Playwright: login → dashboard → criar slug → copiar link → arquivar → visitar redirect → confirmar 302.
    - Diff funcional: mesmas features, mesmos endpoints, mesmo comportamento.

**O que a Fase 1 NÃO faz:** trocar cor, tipografia, layout mobile, redesenhar Dashboard ou Slugs. Isso é Fase 2/3/4.

## Fases seguintes (resumo — plano detalhado ao entrar em cada uma)

- **Fase 2 — Mobile First & Identidade**: paleta `#0A0A0A`/`#13C286`, Geist, `AppShell` mobile-first (bottom tab bar iOS-safe, header sticky com safe-area, inputs `text-base` para não dar zoom), navegação com poucos toques, skeletons.
- **Fase 3 — Dashboard**: reprojetado — Online agora / Cliques hoje / Cliques mês / Slugs ativas / Latência média / Alertas. Fora: métricas técnicas, gráficos redundantes.
- **Fase 4 — Slugs**: fluxo híbrido (Modal desktop / Bottom-sheet mobile), campos mínimos (Domínio · Nome · Slug · URL destino opcional). Sem URL → modo Espera automático. Copia o link e confirma. Ativar Modo Real com 1 clique na lista.
- **Fase 5 — Domínios**: painel com status DNS/Worker/SSL, badge de saúde, ação "verificar agora", arquitetura pronta para plugar Cloudflare API depois (adapter isolado em `lib/cloudflare/`).
- **Fase 6 — Eventos & Analytics**: tabela enxuta (horário · slug · domínio · destino · tempo · dispositivo). Auditoria administrativa fica em aba separada, fora da visão padrão.

## Contrato de compatibilidade

- Endpoints `/`, `/$`, `/r/$`, `/api/public/*` intocados.
- `redirect-handler.ts` intocado.
- Nenhuma migration nesta fase.
- Nenhuma slug/rota removida.
- Clientes ativos continuam funcionando exatamente como hoje.

## Entrego a Fase 1 assim que você aprovar

Depois valido com build + smoke test antes de te chamar para revisar. Cada fase seguinte segue o mesmo ritual: plano curto → executo → valido → mostro → você aprova a próxima.
