# Criação manual e automática de links

## Objetivo
Atualizar o formulário “Novo link” para permitir escolher entre slug manual e slug automático, sem alterar o restante do fluxo.

## Alterações
- Adicionar dois seletores lado a lado: “✏️ Manual” e “⚡ Automático”, iniciando em Manual.
- No modo Manual, exibir o campo de slug com o novo exemplo, aceitar somente letras minúsculas, números, hífens e underscores e informar duplicidade ao lado do campo.
- No modo Automático, ocultar o campo e exibir uma prévia do formato gerado.
- Ao salvar automaticamente, gerar `ut-` mais seis caracteres aleatórios e confirmar que o valor está livre antes de criar o link.
- Restaurar o formulário para Manual sempre que ele for fechado ou concluído.

## Validação
- Conferir os dois modos no painel em tela móvel e desktop.
- Confirmar ocultação e retorno do campo, mensagens de validação e formato do slug automático.
