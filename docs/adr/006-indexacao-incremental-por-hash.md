# ADR 006 — Indexação incremental por hash

**Status:** aceita · 2026-11-19

## Contexto

Gerar embedding é a operação cara do pipeline. Reindexar um vault inteiro a
cada comando é inviável: com 2.000 notas, seriam milhares de chamadas ao modelo
a cada vez. Preciso saber o que mudou desde a última indexação.

## Decisão

Uma tabela `files` funciona como manifesto: para cada nota já indexada, guarda
caminho relativo, `sha256` do conteúdo, `mtime`, tamanho e quando foi indexada.

A cada `brain index`, o vault é percorrido e cada nota cai num de quatro casos:

| Caso | Detecção | Ação |
|---|---|---|
| Nova | não está no manifesto | indexa |
| Alterada | hash difere | apaga os trechos antigos e reindexa |
| Inalterada | hash igual | pula |
| Removida | está no manifesto, não no disco | apaga os trechos |

O `mtime` é usado apenas como atalho: se `mtime` e tamanho batem com o
manifesto, o hash não é nem calculado. É uma otimização, não a fonte da
decisão.

## Alternativas consideradas

**Só `mtime`.** Rejeitada como fonte de verdade. `mtime` mente em várias
situações comuns: `git checkout`, restauração de backup, sincronização de
arquivos e `touch`. O resultado seriam notas alteradas que nunca reindexam —
uma falha silenciosa, que é a pior categoria.

**Só hash, sem atalho de `mtime`.** Rejeitada. Correto, mas leria 2.000
arquivos inteiros a cada comando. O atalho recupera o custo quase todo sem
abrir mão da correção, porque o hash continua sendo calculado sempre que há
qualquer suspeita.

**Observar o sistema de arquivos (watcher).** Rejeitada, ver
[ADR 009](009-reconciliacao-sob-demanda.md).

## Consequências

- Um `brain index` num vault sem alterações é essencialmente um `stat` por
  arquivo. Rápido o bastante para rodar antes de cada busca, se eu quiser.
- A granularidade é o arquivo, não o trecho. Mudar uma vírgula numa nota
  reindexa a nota inteira. Aceito: notas são pequenas, e rastrear trecho a
  trecho exigiria casar trechos antigos com novos, o que é bem mais complexo e
  frágil que reindexar.
- Renomear uma nota aparece como remoção mais inclusão. O conteúdo é reindexado
  à toa. Detectar renomeação por hash é possível e fica anotado como melhoria,
  mas não entra agora.
- O manifesto é o que permite o `reconcile` existir: ele compara as três fontes
  (disco, manifesto, trechos) e aponta divergência.
