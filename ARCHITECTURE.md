# Arquitetura

O Brain é uma CLI local, em Node/TypeScript, que indexa um vault Obsidian e
responde buscas híbridas sobre ele. Visão de produto em [docs/SPEC.md](docs/SPEC.md),
decisões em [docs/adr/](docs/adr/), ordem de construção em [docs/ROADMAP.md](docs/ROADMAP.md).

```
         ┌──────────────┐
         │  vault/*.md  │  ← fonte de verdade (Obsidian edita aqui)
         └──────┬───────┘
                │ leitura + hash
                ▼
         ┌──────────────┐        ┌──────────────┐
         │   indexador  │───────▶│    Ollama    │  embeddings locais
         └──────┬───────┘        └──────────────┘
                │ trechos + vetores
                ▼
   ┌────────────────────────────┐
   │  vault/.brain/index.db     │  índice derivado, descartável
   │  files · chunks ·          │
   │  chunks_fts · chunks_vec   │
   └────────────┬───────────────┘
                ▼
         ┌──────────────┐
         │    busca     │  FTS5 + vetorial, fundidos por RRF
         └──────────────┘
```

| Assunto | Como | Decisão |
|---|---|---|
| Interface | CLI local, sem servidor | [ADR 001](docs/adr/001-cli-local-em-vez-de-mcp.md) |
| Fonte de verdade | Arquivos Markdown do vault | [ADR 002](docs/adr/002-vault-como-fonte-de-verdade.md) |
| Embeddings | Ollama local (`bge-m3`) | [ADR 003](docs/adr/003-embeddings-locais-com-ollama.md) |
| Índice | Um SQLite: manifesto, FTS5 e `sqlite-vec` | [ADR 004](docs/adr/004-sqlite-unico-para-o-indice.md) |
| Busca | Híbrida, fundida por RRF | [ADR 005](docs/adr/005-busca-hibrida-com-rrf.md) |
| Indexação | Incremental por hash | [ADR 006](docs/adr/006-indexacao-incremental-por-hash.md) |
| Onde fica o índice | `<vault>/.brain/` | [ADR 007](docs/adr/007-indice-dentro-do-vault.md) |
| Chunking | Guiado por headings | [ADR 008](docs/adr/008-chunking-guiado-por-headings.md) |
| Reparo | `brain reconcile`, sob demanda | [ADR 009](docs/adr/009-reconciliacao-sob-demanda.md) |
| Histórico | Git opcional | [ADR 010](docs/adr/010-git-opcional-e-explicito.md) |
| Runtime | Node 24 + TypeScript | [ADR 011](docs/adr/011-node-typescript-como-runtime.md) |

## Fronteira entre CLI e lógica

`src/cli.ts` é o único módulo que conhece `parseArgs`, `stdout`, `readline` e
`process.exit`. Todo o resto recebe argumentos e devolve dados ou lança erros
tipados. É o que mantém aberta a porta para uma API HTTP ou um servidor MCP
por cima, como casca fina.

## Repositório

```
src/
  cli.ts        entrada do comando `brain`; parse, impressão, códigos de saída
  config.ts     carga da configuração (argumento > ambiente > arquivo > padrão)
  init.ts       preparação do vault (`brain init`)
  version.ts    versão lida do package.json
  vault.ts      varredura do vault, leitura de nota, frontmatter e título
  chunk.ts      quebra em trechos guiada por headings (ADR 008)
  markdown.ts   cercas de código e headings, usados por vault e chunk
tests/          Vitest; nenhum teste exige Ollama
docs/           SPEC, ADRs, specs e roadmap
```

Os módulos de vault, embeddings, índice, busca, notas, reconciliação e Git
entram um por commit, seguindo o roadmap.
