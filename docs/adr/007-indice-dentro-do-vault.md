# ADR 007 — O índice mora dentro do vault

**Status:** aceita · 2026-11-19

## Contexto

O arquivo `index.db` precisa de um lugar. As convenções apontariam para
`~/.local/share/brain/` ou o equivalente XDG, com o caminho do vault gravado na
configuração.

## Decisão

O índice fica em `<vault>/.brain/index.db`.

`.brain/` entra no `.gitignore` do vault e na lista de pastas que o indexador
ignora.

## Alternativas consideradas

**`~/.local/share/brain/<hash-do-vault>/index.db`.** Rejeitada. Segue a
convenção, mas cria um índice órfão toda vez que eu mover, renomear ou apagar
um vault. E, se eu tiver dois vaults, preciso de um mapeamento de caminho para
índice que pode ficar obsoleto sozinho.

**Um índice global cobrindo vários vaults.** Rejeitada. Misturaria contextos
que eu quero separados e tornaria "apagar e reindexar" uma operação cara.

## Consequências

- O índice acompanha o vault: mover a pasta não quebra nada, apagar a pasta não
  deixa lixo.
- Vaults diferentes ficam naturalmente isolados, sem configuração.
- O índice precisa ser excluído do Git e do próprio indexador. Esquecer disso
  produz um loop óbvio (indexar o índice) e sujeira no histórico — então
  `.brain/` vai na lista de exclusões padrão, não numa configuração opcional.
- O Obsidian mostra pastas ocultas? Não por padrão, então `.brain/` não polui a
  interface. Mesma lógica do `.obsidian/`.
- Backup do vault leva o índice junto. É redundante, já que ele é derivado, mas
  o custo é pequeno e a alternativa seria pedir ao usuário que configurasse
  exclusão no backup.
