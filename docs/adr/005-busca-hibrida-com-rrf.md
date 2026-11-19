# ADR 005 — Busca híbrida fundida por RRF

**Status:** aceita · 2026-11-19

## Contexto

Palavra-chave e similaridade vetorial falham em casos opostos. FTS5 não acha
"por que usamos fila" quando a nota diz "a assincronia absorve picos de
escrita". A busca vetorial não acha `RepoWriter` nem `0x1F` de forma confiável,
porque nomes próprios e literais se dissolvem no espaço semântico.

Eu quero uma lista só. Para isso preciso combinar dois rankings cujos scores
não são comparáveis: BM25 do FTS5 é um score sem limite superior, e a distância
vetorial está em outra escala.

## Decisão

Cada motor devolve seu top-N separadamente. As duas listas são fundidas por
**reciprocal rank fusion**:

```
score(d) = Σ  1 / (k + rank_i(d))        k = 60
         i∈motores
```

O `rank` é a posição do documento em cada lista, começando em 1. Documentos
presentes nas duas listas sobem naturalmente.

## Alternativas consideradas

**Só vetorial.** Rejeitada. Perde nome próprio, sigla e código, que é metade do
que eu procuro em nota técnica.

**Só FTS5.** Rejeitada. É o modo de busca que eu já tenho no Obsidian; o
projeto inteiro só se justifica pelo outro.

**Normalizar os scores e somar com peso.** Rejeitada. Exigiria normalizar BM25,
que não tem limite superior definido, contra distância de cosseno. A
normalização por min-max dentro do resultado é instável: o peso efetivo de cada
motor muda conforme a distribuição de scores daquela consulta. RRF usa só a
ordem, que é justamente a parte comparável entre os dois.

**Reranking com cross-encoder.** Rejeitada por ora. Melhoraria a ordenação, mas
acrescenta um segundo modelo e latência, e RRF já resolve o grosso. Fica
anotado como possível evolução.

## Consequências

- Nenhuma calibração de peso entre os motores, e nenhum ajuste necessário
  quando eu trocar de modelo de embedding.
- O score final não tem significado absoluto: serve para ordenar, não para
  dizer "este resultado é 81% relevante". A CLI não deve apresentá-lo como
  porcentagem de confiança.
- `k = 60` é o valor da literatura e vale como padrão. Fica configurável para
  eu poder medir, não para eu ficar ajustando.
- Um documento que aparece só numa das listas ainda pode vencer, desde que
  esteja no topo dela. Isso é desejado: é o que faz a busca por sigla funcionar.
- Preciso de um conjunto de consultas de referência para saber se uma mudança
  na busca melhorou ou piorou. Sem isso, ajustar a fusão vira chute.
