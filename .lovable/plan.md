# Modelo institucional único com três temas

## Objetivo
Substituir as três páginas de espera independentes por um único documento HTML institucional, mantendo a rotação aleatória apenas no tema visual e preservando integralmente o redirecionamento HTTP 302 do modo Real.

## Implementação
- Gerar um dos temas `id01`, `id02` ou `id10` em cada visita e aplicar `data-estilo` no elemento `<html>`.
- Usar uma estrutura única com cabeçalho, navegação, apresentação com dois botões, três cartões informativos, tabela de dados cadastrais e rodapé.
- Reutilizar o nome seguro do link em toda a página como marca da empresa.
- Definir cores, tipografia, cantos, alinhamento e detalhes visuais por variáveis CSS específicas de cada tema.
- Carregar Archivo Black, Inter, Poppins e Space Grotesk pela tag de fonte solicitada.
- Incluir Política de Privacidade e Termos de Uso em modais acessíveis, abertos e fechados com JavaScript nativo, sem bibliotecas externas.
- Aplicar layout mobile-first, navegação adaptável, animações CSS suaves e suporte a redução de movimento.

## Preservação
- Não alterar busca de slug, regras de acesso, métricas, rastreamento ou banco de dados.
- Links em modo Real continuarão retornando HTTP 302 imediato, sem HTML intermediário.
- A página continuará sendo retornada diretamente pelo servidor com `Cache-Control: no-store`.

## Validação
- Verificar tipos e compilação automática.
- Testar a resposta HTML e a rotação dos três valores de `data-estilo`.
- Validar layout em celular e desktop, navegação interna e abertura/fechamento dos dois modais legais.
