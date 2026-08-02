# Fases 5 e 6 — Eventos, Auditoria e Analytics

**Duplicação de perfil** já foi corrigida no turno anterior (`UserMenu` único, sidebar no desktop, drawer no mobile, header limpo). Vou confirmar visualmente e seguir.

---

## 1. Base de dados (migração não destrutiva)

Estender `link_audit` para servir também de auditoria de domínios e configurações, sem quebrar o existente:

- Nova coluna `entity_type text not null default 'link'` (valores: `link`, `domain`, `settings`).
- Nova coluna `entity_id uuid` (nullable — para `link_audit` já existe `link_id`; usamos `entity_id` p/ domínio/settings).
- Novas colunas `before jsonb`, `after jsonb`, `label text` (todas nullable). Rows atuais continuam válidos.
- Índices: `clicks(created_at desc)`, `clicks(link_id, created_at desc)`, `link_audit(created_at desc)`, `link_audit(entity_type, created_at desc)`.
- Nenhuma alteração em `links`, `domains`, `clicks`, `settings` além de índices.
- Rollback trivial: apenas `DROP COLUMN` / `DROP INDEX`.

## 2. Camada de auditoria

Novo módulo `src/lib/supabase/queries/audit.ts` com:

- `logLinkAudit(action, link, { before, after, label })`
- `logDomainAudit(action, domain, { before, after, label })`
- `logSettingsAudit(action, { before, after, label })`
- `fetchAuditPage({ page, pageSize, entityType, action, search, range })` — paginado server-side.

Integrar em `queries/links.ts` (create, update, archive, restore, activate, deactivate, setDomain, setMode) e `queries/domains.ts` (create, update, setPrimary, archive, restore) sempre com `before`/`after` das colunas relevantes. Trigger de banco NÃO é usado — evita divergência com o front.

## 3. Eventos operacionais (`/admin/events`)

Reescrever a página com **duas abas**:

- **Acessos** — apenas cliques.
- **Histórico de Alterações** — apenas auditoria.

Ambas com paginação server-side (`range().range(offset, offset+size-1)` + `count: exact`) e filtros executados no banco:

Aba **Acessos**:
- Colunas: horário, nome+slug, domínio, destino, resultado (Redirecionado/Página de espera/Bloqueado/Erro derivado de `mode_at_click`+`redirect_ms`), latência, dispositivo, país.
- Filtros: resultado, domínio, link, dispositivo, país, período.
- Busca por nome, slug, domínio, URL.
- Ao clicar/tocar: drawer (desktop) / bottom-sheet (mobile) com URL pública, destino, horário completo, latência, resultado, domínio, dispositivo, país, id do evento. Nada de IP.
- Realtime só na primeira página (invalida `clicks` na Realtime).

Aba **Histórico de Alterações**:
- Colunas: horário, ação, entidade afetada (link/domain/settings + label), valor anterior, valor novo, operador.
- Filtros: entidade, ação, período, busca.
- Sem realtime — histórico é sequencial.

## 4. Analytics de negócio (`/admin/analytics`)

Reescrever como **página de negócio**, sem P50/P95/buckets:

- **Resumo**: cliques no período, links com acesso, domínios utilizados, links ativos/em espera, tempo médio, taxa de redirecionamento, taxa de página de espera.
- **Por domínio**: cards com totais/ativos/espera/arquivados, cliques período/totais, tempo médio, primeira/última utilização, índice (reutiliza `domain-usage.ts`).
- **Por link**: lista compacta com cliques período/totais, redirecionado, espera, erros, tempo médio, último acesso, domínio, destino atual.
- **Gráficos** (apenas 5): cliques ao longo do tempo, cliques por domínio, top links, distribuição redirecionado×espera, dispositivos.
- **Relatório mensal**: seletor de mês, tabela consolidada com colunas totais, por domínio, top links, redir×espera, tempo médio. Estrutura pronta para exportação (função `buildMonthlyReport` retorna DTO) mas sem botão CSV/PDF agora.

Período: Hoje, 7d, 30d, Este mês, Personalizado.

## 5. Navegação

Novo `NAV` no `AdminShell`:

```text
Dashboard  Links  Domínios  Eventos  Analytics  Configurações
```

Remover "Latência" do menu (rota `/admin/latency` mantida por enquanto, sem link — pode ser removida em fase futura).

## 6. Componentes novos

- `src/components/admin/events/AccessTable.tsx`
- `src/components/admin/events/AuditTable.tsx`
- `src/components/admin/events/EventDetailsSheet.tsx`
- `src/components/admin/analytics/BusinessSummary.tsx`
- `src/components/admin/analytics/DomainBreakdown.tsx`
- `src/components/admin/analytics/LinkBreakdown.tsx`
- `src/components/admin/analytics/MonthlyReport.tsx`
- `src/hooks/use-access-events.ts`, `use-audit.ts`, `use-business-analytics.ts`

## 7. Compatibilidade

- Nenhuma alteração em `/r/*`, `/$slug`, resolução de slug, contadores, RLS de tabelas em produção.
- Slugs, redirects, contagem histórica, regras ativo/espera intactos.
- Migração adiciona colunas opcionais + índices; sem `DROP`, sem `NOT NULL`, sem rename.

## Critérios de aceite mapeados

- Acessos ≠ ações admin: abas separadas. ✅
- Paginação/filtros no banco: `range + count: exact` + `.ilike/.eq/.in`. ✅
- Antes/depois no histórico: colunas `before`/`after` gravadas em toda mutação. ✅
- Arquivamento preserva histórico: nada é apagado no arquivamento. ✅
- Analytics bate com Dashboard/Links/Domínios: mesmas queries base de `use-dashboard` e `domain-usage`. ✅
- Sem zoom no iPhone: manter viewport atual, cards + bottom-sheet no mobile. ✅
- Sem duplicação de perfil/nav: `UserMenu` único, `NAV` sem repetição. ✅
- Redirect intacto: nenhum arquivo em `src/lib/redirect-handler.ts` ou `/routes/r.*`, `/routes/$slug` é tocado. ✅
