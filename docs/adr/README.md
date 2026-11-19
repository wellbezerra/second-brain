# Registros de decisão de arquitetura

Cada arquivo registra uma decisão: o contexto em que ela foi tomada, o que foi
decidido, o que foi descartado e com que consequência.

O propósito é responder "por que isso é assim?" meses depois, sem depender da
memória. Decisão revista não se apaga: cria-se um ADR novo que supera o
anterior, e o anterior muda de status para *superada por NNN*.

| # | Decisão | Status |
|---|---|---|
| [001](001-cli-local-em-vez-de-mcp.md) | CLI local no lugar de servidor MCP | aceita |
| [002](002-vault-como-fonte-de-verdade.md) | O vault em disco é a fonte de verdade | aceita |
| [003](003-embeddings-locais-com-ollama.md) | Embeddings locais via Ollama | superada por 012 |
| [004](004-sqlite-unico-para-o-indice.md) | Um SQLite para manifesto, FTS5 e vetores | aceita |
| [005](005-busca-hibrida-com-rrf.md) | Busca híbrida fundida por RRF | aceita |
| [006](006-indexacao-incremental-por-hash.md) | Indexação incremental por hash | aceita |
| [007](007-indice-dentro-do-vault.md) | O índice mora dentro do vault | aceita |
| [008](008-chunking-guiado-por-headings.md) | Chunking guiado por headings | aceita |
| [009](009-reconciliacao-sob-demanda.md) | Reconciliação sob demanda, sem daemon | aceita |
| [010](010-git-opcional-e-explicito.md) | Git opcional e explícito | aceita |
| [011](011-node-typescript-como-runtime.md) | Node.js e TypeScript como runtime | aceita |
| [012](012-embeddings-por-api-com-provedor-configuravel.md) | Embeddings por API, com provedor configurável | aceita |

## Formato

Título, status com data, e quatro seções: **Contexto**, **Decisão**,
**Alternativas consideradas** e **Consequências**.

A seção de alternativas é a que carrega mais valor com o tempo. Registrar o que
foi descartado e por quê evita refazer a mesma análise, e deixa claro quando a
premissa mudou a ponto de valer reabrir a discussão.
