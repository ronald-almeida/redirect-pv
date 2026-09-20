# Três páginas institucionais para o modo Espera

## Objetivo
Substituir as três telas curtas atuais por três páginas institucionais completas, leves e responsivas, mantendo intacto o redirecionamento HTTP 302 dos links em modo Real.

## Implementação
- Manter a seleção aleatória existente com `Math.floor(Math.random() * 3) + 1`.
- Criar três documentos HTML completos, renderizados diretamente pelo servidor:
  1. Tecnologia/Digital em tema escuro com destaque índigo.
  2. Saúde/Bem-estar em tema claro com verde suave.
  3. Negócios/Consultoria em tema corporativo branco e azul-marinho.
- Em cada página incluir cabeçalho, navegação interna, apresentação, sobre, serviços, contato, formulário simples e rodapé.
- Usar o nome do link como marca no cabeçalho, apresentação e rodapé, sempre escapado para segurança.
- Implementar layout mobile-first, navegação por âncoras, estados de foco, efeitos de interação e animações CSS respeitando redução de movimento.
- Manter carregamento rápido, sem bibliotecas, imagens remotas ou chamadas adicionais.

## Preservação
- Não alterar resolução de slug, regras de acesso, métricas, rastreamento ou banco de dados.
- Links em modo Real continuarão retornando 302 imediato, sem HTML intermediário.
- Links inexistentes ou bloqueados continuarão usando uma das páginas de espera.

## Validação
- Verificar compilação automática e testar a resposta HTML em tamanhos mobile e desktop.
- Confirmar que o nome do link aparece corretamente e que o modo Real continua produzindo 302 direto.
