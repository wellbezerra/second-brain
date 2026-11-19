# Spec 08 — Reconciliação

**Commit:** `feat: reconciliação do índice`
**Depende de:** [05](05-indexacao-incremental.md)
**Decisão de referência:** [ADR 009](../adr/009-reconciliacao-sob-demanda.md)

## Objetivo

Verificar se o índice condiz com o vault e com ele mesmo, relatar as
divergências e, sob pedido, corrigi-las.

É a ferramenta de diagnóstico do projeto: quando a busca devolver algo
estranho, é aqui que se descobre o porquê.

## Escopo

**Entra:** as quatro verificações, relatório, `--fix`, `brain reconcile`.

**Fica de fora:** execução automática ou agendada — fora do escopo por
decisão, não por falta de tempo.

## As quatro verificações

Três fontes precisam concordar: o disco, o manifesto (`files`) e as tabelas de
trechos (`chunks`, `chunks_fts`, `chunks_vec`).

| # | Divergência | Como aparece | Causa provável | `--fix` |
|---|---|---|---|---|
| 1 | nota no disco, ausente do manifesto | varredura menos manifesto | nunca indexada | indexa |
| 2 | nota no manifesto, ausente do disco | manifesto menos varredura | apagada fora da CLI | remove trechos e linha |
| 3 | hash do manifesto diverge do disco | releitura e hash | editada fora da CLI | reindexa |
| 4 | trechos desalinhados entre as três tabelas | comparação dos conjuntos de id | interrupção no meio da escrita, ou bug | reindexa a nota |

A quarta é a que verifica o invariante da
[spec 04](04-esquema-do-indice.md): o conjunto de ids em `chunks`,
`chunks_fts` e `chunks_vec` tem que ser idêntico. Também pega trecho órfão,
cujo `file_id` não existe mais em `files`.

A verificação 3 relê e re-hasheia **todo** o vault, ignorando o atalho de
`mtime` que a [spec 05](05-indexacao-incremental.md) usa. É por isso que
`reconcile` é um comando separado de `index`: é lento por construção, e serve
justamente para o caso em que o `mtime` mentiu.

## Interface

```
brain reconcile [--fix] [--json] [--quiet]
```

Sem `--fix`, só relata e não escreve nada no índice. Código de saída 0 se está
tudo alinhado, 1 se encontrou divergência — o que permite usar em script.

```
Reconciliação de ~/Documentos/notas

  ✓ 2.041 notas alinhadas
  ✗ 2 notas no disco que não estão no índice
      Projetos/ideias.md
      Diario/2026-11-18.md
  ✗ 1 nota no índice que não existe mais no disco
      Arquivo/antigo.md
  ✗ 1 nota com 12 trechos em chunks, 12 em fts, 11 em vec
      Projetos/brain.md

4 divergências. Rode `brain reconcile --fix` para corrigir.
```

Relatar antes de corrigir é o ponto do desenho. Quando o índice está
estranho, a causa interessa mais que o conserto: três notas divergentes sugerem
edição externa, trezentas sugerem bug meu.

## Correção

Com `--fix`, cada divergência é corrigida pela ação da tabela acima, uma
transação por nota, com relatório do que foi feito.

Se mais de 20% das notas divergirem, o comando para e sugere `--rebuild` em vez
de corrigir uma a uma. Divergência nessa escala indica causa sistêmica — troca
de modelo, mudança de chunking, corrupção — e reconstruir é mais rápido e mais
confiável que remendar.

## Critérios de aceite

- Índice recém-construído: zero divergências, saída 0.
- Nota criada fora da CLI é detectada como caso 1 e, com `--fix`, indexada.
- Nota apagada fora da CLI é detectada como caso 2 e, com `--fix`, removida.
- Nota editada preservando `mtime` e tamanho é detectada como caso 3 — o que o
  `brain index` deixaria passar.
- Linha removida à mão de `chunks_vec` é detectada como caso 4.
- Sem `--fix`, nada no índice é alterado.
- Saída 1 quando há divergência, 0 quando não há.
- Divergência acima de 20% interrompe com a sugestão de `--rebuild`.

## Testes

Divergências fabricadas direto no SQLite e no sistema de arquivos — é o jeito
de simular corrupção que, por construção, o código normal não produz.

O teste do caso 3 é o mais valioso: editar o conteúdo restaurando `mtime` e
tamanho com `os.utime`, confirmar que `brain index` não detecta e que
`brain reconcile` detecta. Ele documenta, em código executável, por que os dois
comandos existem separados.
