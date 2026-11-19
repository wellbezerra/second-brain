# Brain — a local second brain over an Obsidian vault

Product overview. Decisions are in [`adr/`](adr/), each feature's detail in
[`specs/`](specs/) and the build order in [`ROADMAP.md`](ROADMAP.md).

## The problem

Personal notes gain value over time, but only if you can get them back. Two
search modes fail in opposite ways:

- **Keyword** finds what you remember writing. It fails when you remember the
  idea, not the terms.
- **Meaning** finds what you meant. It fails on proper names, acronyms, code
  snippets and anything that depends on exact spelling.

Anyone who writes technical notes needs both. None of the tools I already use
delivers both over the same files without sending the content off the machine.

## What Brain is

A CLI that indexes an Obsidian vault and answers hybrid searches over it.

- Notes remain Markdown files in a folder. Obsidian keeps working normally,
  with no plugin at all.
- The index is a SQLite file inside the vault, derived and disposable.
- Embeddings are generated locally by Ollama. Nothing leaves the machine.
- Search combines FTS5 and vector similarity and returns a single list.

## What Brain is not

Drawing this line matters because the project started as a replica of a remote
MCP server, and almost all of that project's weight came from requirements that
do not exist here.

| It is not | Because |
|---|---|
| An MCP server | The interface is a local CLI ([ADR 001](adr/001-local-cli-instead-of-mcp.md)) |
| A remote service | Personal use, one machine, no external access for now |
| An editor | Obsidian already edits; Brain indexes and searches |
| A multi-user system | No authentication, no OAuth, no access control |
| A file sync | Git or iCloud syncs, if that is ever needed |
| A generative RAG | It returns chunks, not answers. Whatever generates text is the assistant consuming the output |

## What it looks like in use

```console
$ brain index
12 new notes, 3 changed, 1 removed — 184 chunks indexed in 6.2s

$ brain search "why we chose a queue instead of a direct call"
1. Architecture/indexing.md  ·  Indexing > Decisions           (0.81)
   The queue absorbs write spikes and keeps indexing off the
   critical path of the write...

2. Journal/2026-03-14.md  ·  Conversation with the team        (0.64)
   We discussed calling the indexer straight from the writer. The problem is...

$ brain save "sqlite-vec accepts distance_metric=cosine in the column definition" --tag sqlite
Journal/2026-11-19.md
```

## Architecture

Everything runs in process, with no daemon and no external network.

```
         ┌──────────────┐
         │  vault/*.md  │  ← source of truth (Obsidian edits here)
         └──────┬───────┘
                │ read + hash
                ▼
         ┌──────────────┐        ┌──────────────┐
         │   indexer    │───────▶│    Ollama    │  local embeddings
         └──────┬───────┘        └──────────────┘
                │ chunks + vectors
                ▼
   ┌────────────────────────────┐
   │  vault/.brain/index.db     │  derived, disposable index
   │  ├── files   (manifest)    │
   │  ├── chunks  (chunks)      │
   │  ├── chunks_fts  (FTS5)    │
   │  └── chunks_vec  (vectors) │
   └────────────┬───────────────┘
                │
                ▼
         ┌──────────────┐
         │    search    │  FTS5 + vector, fused by RRF
         └──────────────┘
```

The index can always be rebuilt from the vault. That is the property that lets
corruption, a model change and an indexing bug be handled the same way: delete
and reindex.

## Glossary

- **Vault** — the folder of Markdown notes. What Obsidian calls a vault.
- **Note** — a `.md` file inside the vault.
- **Chunk** — a piece of a note, the unit of search and of embedding.
- **Manifest** — the `files` table, with the hash of each indexed note. It is
  what makes it possible to know what changed without rereading everything.
- **Drift** — divergence between the vault and the index. The target of
  `reconcile`.
- **RRF** — reciprocal rank fusion, how the two search lists become one.

## Non-functional requirements

| Dimension | Target |
|---|---|
| Incremental indexing | A 2,000-note vault with no changes reindexes in under 2s |
| Search latency | Under 300ms for a 2,000-note vault, query embedding included |
| Consistency | After `brain index`, both searches reflect the disk. There is no asynchronous indexing |
| Cost | Zero recurring cost |
| Network | Localhost only. The project must work with the machine offline |
| Dependencies | Node 24, better-sqlite3 (SQLite with FTS5), sqlite-vec, Ollama. Nothing else ([ADR 011](adr/011-node-typescript-runtime.md)) |

## Recorded decisions

| ADR | Decision |
|---|---|
| [001](adr/001-local-cli-instead-of-mcp.md) | Local CLI instead of an MCP server |
| [002](adr/002-vault-as-source-of-truth.md) | The vault on disk is the source of truth |
| [003](adr/003-local-embeddings-with-ollama.md) | Local embeddings with Ollama |
| [004](adr/004-single-sqlite-index.md) | One SQLite file for the manifest, FTS5 and vectors |
| [005](adr/005-hybrid-search-with-rrf.md) | Hybrid search fused by RRF |
| [006](adr/006-incremental-indexing-by-hash.md) | Incremental indexing by hash |
| [007](adr/007-index-inside-the-vault.md) | The index lives inside the vault |
| [008](adr/008-heading-guided-chunking.md) | Heading-guided chunking |
| [009](adr/009-on-demand-reconciliation.md) | On-demand reconciliation, no daemon |
| [010](adr/010-optional-explicit-git.md) | Optional, explicit Git |
| [011](adr/011-node-typescript-runtime.md) | Node.js and TypeScript as the runtime |
