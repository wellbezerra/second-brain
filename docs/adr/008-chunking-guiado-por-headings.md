# ADR 008 — Chunking guiado por headings

**Status:** aceita · 2026-11-19

## Contexto

Um embedding por nota inteira não funciona: uma nota de 3.000 palavras vira um
vetor médio que não se parece com nenhum dos assuntos que ela trata. Preciso
quebrar em trechos. A questão é por onde cortar.

Markdown já carrega uma estrutura explícita de seções. Ignorá-la para cortar a
cada N caracteres joga fora informação que o autor deu de graça.

## Decisão

A quebra segue os headings. Cada seção vira um ou mais trechos, e cada trecho
carrega o **caminho de headings** acima dele, prefixado pelo título da nota:

```
Projeto Alfa > Arquitetura > Decisões
```

Esse caminho entra no texto enviado ao modelo de embedding e também vai para
uma coluna indexada do FTS5.

Seções maiores que o alvo (~1.200 caracteres) são repartidas por parágrafo,
com sobreposição de ~150 caracteres. Parágrafo que sozinho estoura o alvo é
cortado por sentença, como último recurso.

## Alternativas consideradas

**Tamanho fixo com sobreposição, ignorando a estrutura.** Rejeitada. É o padrão
de biblioteca de RAG e funciona em texto corrido, mas desperdiça a estrutura
que o Markdown já tem e produz trechos que começam no meio de uma frase e
terminam no meio de outra.

**Uma nota, um embedding.** Rejeitada. Só funcionaria se minhas notas fossem
todas curtas e monotemáticas, e elas não são.

**Chunking semântico (quebrar onde o embedding de frases vizinhas diverge).**
Rejeitada por ora. Custa um embedding por sentença só para decidir onde cortar,
e o ganho sobre a quebra por heading em documento bem estruturado é pequeno.

## Consequências

- O contexto herdado melhora bastante a busca. Um trecho que diz "Rejeitada
  pelo custo" é inútil sozinho; com `ADR 004 > Alternativas > Qdrant` na
  frente, ele é recuperável.
- Nota sem nenhum heading vira uma seção só, repartida por tamanho. Funciona,
  só não ganha o contexto extra.
- O parser precisa ignorar `#` dentro de blocos de código, senão um comentário
  em shell script vira heading e estilhaça a nota.
- Trechos muito curtos (menos de ~60 caracteres) são descartados como ruído,
  com a exceção de uma nota que inteira é curta — essa precisa gerar pelo
  menos um trecho, ou sumiria da busca.
- Os parâmetros (alvo, sobreposição, mínimo) são constantes do módulo, não
  configuração. Mudá-los invalida a comparação entre índices, então a mudança
  deve ser deliberada e acompanhada de reindexação.
