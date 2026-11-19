# Architecture

Brain is a local CLI, in Node/TypeScript, that indexes an Obsidian vault and
answers hybrid searches over it. Product overview in [docs/SPEC.md](docs/SPEC.md),
decisions in [docs/adr/](docs/adr/), build order in [docs/ROADMAP.md](docs/ROADMAP.md).

```
         ┌──────────────┐
         │  vault/*.md  │  ← source of truth (Obsidian edits, Brain only reads)
         └──────┬───────┘
                │ read + hash
                ▼
         ┌──────────────┐        ┌──────────────┐
         │   indexer    │───────▶│    Ollama    │  local embeddings
         └──────┬───────┘        └──────────────┘
                │ chunks + vectors
                ▼
   ┌────────────────────────────┐
   │ <data-dir>/brain/<id>/     │  derived, disposable index,
   │ index.db                   │  outside the vault
   │  files · chunks ·          │
   │  chunks_fts · chunks_vec   │
   └────────────┬───────────────┘
                ▼
         ┌──────────────┐
         │    search    │  FTS5 + vector, fused by RRF
         └──────────────┘
```

| Subject | How | Decision |
|---|---|---|
| Interface | Local CLI, no server | [ADR 001](docs/adr/001-local-cli-instead-of-mcp.md) |
| Source of truth | The vault's Markdown files | [ADR 002](docs/adr/002-vault-as-source-of-truth.md) |
| Embeddings | Local Ollama (`bge-m3`) | [ADR 003](docs/adr/003-local-embeddings-with-ollama.md) |
| Index | One SQLite file: manifest, FTS5 and `sqlite-vec` | [ADR 004](docs/adr/004-single-sqlite-index.md) |
| Search | Hybrid, fused by RRF | [ADR 005](docs/adr/005-hybrid-search-with-rrf.md) |
| Indexing | Incremental by hash | [ADR 006](docs/adr/006-incremental-indexing-by-hash.md) |
| Vault access | Read-only; the index lives in the user data directory | [ADR 012](docs/adr/012-read-only-vault.md) |
| Chunking | Heading-guided | [ADR 008](docs/adr/008-heading-guided-chunking.md) |
| Repair | `brain reconcile`, on demand | [ADR 009](docs/adr/009-on-demand-reconciliation.md) |
| Runtime | Node 24 + TypeScript | [ADR 011](docs/adr/011-node-typescript-runtime.md) |

## Boundary between CLI and logic

`src/cli.ts` is the only module that knows `parseArgs`, `stdout`, `readline` and
`process.exit`. Everything else takes arguments and returns data or throws typed
errors. That is what keeps the door open for an HTTP API or an MCP server on
top, as a thin shell.

## Repository

```
src/
  cli.ts        entry point of the `brain` command; parsing, printing, exit codes
  config.ts     configuration loading (argument > environment > file > default)
  init.ts       writes Brain's own configuration (`brain init`); never the vault
  version.ts    version read from package.json
tests/          Vitest; no test requires Ollama
docs/           SPEC, ADRs, specs and roadmap
```

The vault, embeddings, index, search and reconciliation modules arrive one per
commit, following the roadmap.
