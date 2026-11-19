# ADR 002 — O vault em disco é a fonte de verdade

**Status:** aceita · 2026-11-19

## Contexto

Preciso decidir quem manda: os arquivos `.md` no disco ou o banco de dados.
A resposta determina o que acontece quando os dois discordam — e eles vão
discordar, porque o Obsidian escreve nos arquivos sem avisar ninguém.

## Decisão

Os arquivos Markdown são a fonte de verdade. O índice SQLite é um **artefato
derivado e descartável**.

Em qualquer divergência, o disco ganha. Apagar `index.db` nunca perde
informação; só custa uma reindexação.

## Alternativas consideradas

**Banco como fonte de verdade, arquivos como export.** Rejeitada. Quebraria o
Obsidian como editor: o que eu digitasse lá seria sobrescrito ou ignorado. Além
disso, amarraria minhas notas ao formato interno de uma ferramenta que eu mesmo
escrevi e posso abandonar.

**Fonte dupla com merge.** Rejeitada. Resolver conflito entre duas fontes vivas
é o tipo de complexidade que só se justifica com múltiplos escritores remotos —
exatamente o que a [ADR 001](001-cli-local-em-vez-de-mcp.md) tirou do escopo.

## Consequências

- O Obsidian funciona sem plugin, sem configuração e sem saber que o Brain
  existe. Qualquer editor de texto também.
- Corrupção do índice, troca de modelo de embedding, bug no chunking e mudança
  de schema têm todos a mesma solução: apagar e reindexar. Isso simplifica
  bastante o tratamento de erro.
- Edições feitas fora da CLI só aparecem na busca depois de um `brain index`.
  Não há observação do sistema de arquivos ([ADR 009](009-reconciliacao-sob-demanda.md)).
- As notas sobrevivem ao projeto. Se eu largar o Brain amanhã, continuo com uma
  pasta de Markdown.
