## Situação atual (verificada no código)

A área de Eventos já existe com duas abas separadas (`src/routes/admin.events.tsx`), consultas em banco com filtros e paginação (`access-events.ts`, `audit.ts`), tabela de acessos, tabela de auditoria com Antes/Depois e drawer/bottom sheet de detalhes. O que falta são pontos específicos do escopo desta fase — não é uma reconstrução, é o fechamento.

## Lacunas a corrigir

1. **Resultados fora do padrão** — hoje existem 4 resultados (`Redirecionado`, `Página de espera`, `Bloqueado`, `Erro`). O escopo permite apenas 3.
2. **Paginação por botões** — hoje há uma barra de páginas; o pedido é scroll infinito.
3. **Sem realtime** — nenhuma assinatura de novos acessos.
4. **Mobile em linhas divididas**, não em cards.
5. **Aba Histórico com poucos filtros** e Antes/Depois em texto corrido, difícil de ler.
6. Um erro de runtime no preview (`Cannot read properties of null (reading 'use')`) será diagnosticado e corrigido junto.

## O que será feito

### Aba Acessos
- Reduzir os resultados a exatamente três: ✅ Redirecionado, 🟡 Página de Espera, 🔴 Erro. Acessos hoje classificados como "Bloqueado" passam a contar como Erro, no filtro do banco e na exibição.
- Trocar a barra de páginas por **scroll infinito** (carrega em blocos, com sentinela no fim da lista e botão "Carregar mais" como alternativa acessível). Nada de carregar milhares de registros.
- **Realtime só para eventos recentes**: novos acessos entram no topo apenas quando o usuário está no início da lista e o registro passa nos filtros ativos; um indicador discreto "novos acessos" evita saltos de scroll.
- Manter filtros de período (Hoje, 7 dias, 30 dias, Personalizado) e os rápidos (Domínio, Slug, Resultado, Dispositivo, País) e a busca por nome/slug/domínio/URL.
- Garantir que nenhuma ação administrativa apareça nesta aba (a consulta já lê somente acessos).

### Aba Histórico de Alterações
- Filtros próprios: período, tipo de entidade (Link, Domínio, Configuração), ação e busca por nome/slug/domínio.
- Também com scroll infinito.
- Antes/Depois em blocos comparativos legíveis (campo, valor anterior riscado/apagado, valor novo em destaque), incluindo o caso "Destino alterado".
- Histórico permanece intacto quando link ou domínio é arquivado (comportamento já garantido; será validado).

### Mobile
- Acessos e Histórico passam a usar **cards** com áreas de toque confortáveis, sem tabela horizontal e sem zoom (tipografia de entrada em 16px).
- Detalhe do acesso continua em bottom sheet no celular e drawer no desktop, com URL acessada, URL destino, horário completo, tempo, resultado, dispositivo, país e ID do evento.

### Compatibilidade
Nenhuma alteração em redirects, slugs, domínios ou contagem de cliques. As mudanças ficam na camada de leitura e na interface.

## Detalhes técnicos

- `src/lib/supabase/queries/access-events.ts`: remover o resultado `blocked`, ajustar `resultOf` e os predicados `.or/.like`, e trocar paginação por offset por cursor `created_at` para o infinite scroll.
- `src/hooks/use-access-events.ts` e `use-audit.ts`: migrar de `useQuery` para `useInfiniteQuery` com `keepPreviousData`; adicionar canal Supabase Realtime (`clicks`, evento INSERT) com teardown no unmount.
- `src/components/admin/events/`: `AccessTable.tsx` e `AuditTable.tsx` ganham variante de card no mobile; `PagerBar.tsx` é substituído por um `InfiniteFooter.tsx` (sentinela via IntersectionObserver + estado de carregamento/fim).
- `src/routes/admin.events.tsx`: filtros por aba, remoção da opção "Bloqueado", exportação CSV respeitando o que está carregado.
- Investigar o erro de runtime com os logs do preview antes de ajustar o código relacionado.
