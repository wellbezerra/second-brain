# Spec 06 — Busca híbrida

**Commit:** `feat: busca híbrida por palavra-chave e significado`
**Depende de:** [05](05-indexacao-incremental.md)
**Decisão de referência:** [ADR 005](../adr/005-busca-hibrida-com-rrf.md)

## Objetivo

Receber uma consulta em texto e devolver trechos ordenados, combinando FTS5 e
similaridade vetorial numa lista só.

Esta é a feature pela qual o projeto existe.

## Escopo

**Entra:** busca por palavra-chave, busca vetorial, fusão por RRF, filtros,
`brain search`.

**Fica de fora:** reranking por cross-encoder e geração de resposta — nenhum
dos dois está no escopo do projeto.

## Os dois motores

**Palavra-chave.** `chunks_fts MATCH ?`, ordenado por `bm25()`. A coluna
`heading` recebe peso maior que `text`, porque acerto no caminho de headings é
sinal mais forte que acerto no corpo.

A consulta do usuário precisa ser **escapada** antes de virar consulta FTS5.
Aspas, `*`, `-`, `OR`, `NEAR` e parênteses têm significado na sintaxe do FTS5, e
uma busca por `C++` ou por `foo - bar` não pode quebrar o comando. O padrão é
tratar a consulta como termos literais; a sintaxe do FTS5 fica disponível atrás
de `--raw`, para quem a quiser.

**Vetorial.** A consulta é embeddada pelo mesmo modelo e vira um KNN sobre
`chunks_vec`. Como os vetores estão normalizados, a distância L2 ordena igual
ao cosseno.

Cada motor devolve 3× o limite pedido, para que a fusão tenha material.

## Fusão

```
score(trecho) = Σ  1 / (60 + posição_no_motor_i)
```

Posições começam em 1. Trecho presente nas duas listas acumula as duas
parcelas. Empate é desfeito pela melhor posição individual, e depois pelo
caminho da nota, para a ordenação ser determinística.

O resultado carrega de onde veio (`fts`, `vec` ou ambos), o que é útil para
depurar a busca e para o `--explain`.

## Filtros

```
brain search "consulta" [-n 10] [--path "Projetos/**"] [--since 2026-01-01]
                        [--mode hybrid|keyword|semantic] [--raw]
                        [--fresh] [--json] [--explain]
```

- `--path` — glob sobre o caminho relativo.
- `--since` — notas modificadas a partir da data.
- `--mode` — desliga um dos motores. Serve para comparar e para depurar.
- `--fresh` — roda a indexação incremental antes de buscar
  ([ADR 009](../adr/009-reconciliacao-sob-demanda.md)).
- `--explain` — mostra a posição em cada motor e as parcelas do score.

Os filtros são aplicados **antes** da fusão, em cada motor, para não acontecer
de o top-30 de um motor ser inteiro descartado pelo filtro e sobrar nada.

## Saída

```
1. Projetos/brain.md  ·  Brain > Arquitetura > Decisões          fts+vec
   ...a fila absorve picos de escrita e deixa a indexação fora do
   caminho crítico da gravação. O custo é consistência eventual...

2. Diario/2026-03-14.md  ·  Conversa com o time                      vec
   ...
```

Caminho, caminho de headings, origem e um trecho com os termos em destaque
quando o terminal suporta cor.

**O score não é exibido por padrão.** Score de RRF não tem significado
absoluto, e mostrá-lo convida a lê-lo como porcentagem de relevância, que é
leitura errada. Fica atrás de `--explain`.

Com `--json`, a saída é estruturada, com caminho absoluto, para ser consumida
por outra ferramenta.

## Critérios de aceite

- Busca por termo literal presente numa nota encontra a nota.
- Busca por paráfrase, sem nenhum termo em comum, encontra a nota (com modelo
  real; com `HashEmbedder` não se aplica).
- Consulta com `"`, `*`, `-` ou `C++` não quebra.
- Consulta sem resultado devolve lista vazia e mensagem clara, não erro.
- `--mode keyword` não chama o Ollama.
- Busca num índice vazio não quebra.
- A ordenação é determinística para a mesma consulta e o mesmo índice.
- Latência abaixo de 300ms num vault de 2.000 notas, embedding incluído.

## Testes

Com `HashEmbedder`, a parte semântica não é avaliável de verdade — então os
testes se dividem:

- **Unitários da fusão**, com listas sintéticas: documento nas duas listas
  vence os que estão só numa; posição 1 em um motor pode vencer posição 3 nos
  dois; empate é determinístico; lista vazia de um motor não quebra.
- **Unitários do escape**, com consultas hostis: `"`, `*`, `(`, `OR`, `C++`,
  string vazia, só espaços, 500 caracteres.
- **Integração** do caminho completo, verificando que a nota certa aparece,
  sem afirmar nada sobre a ordem exata.

A qualidade semântica de verdade é medida pelo conjunto de consultas de
referência da [spec 10](10-empacotamento-e-avaliacao.md), com modelo real.
