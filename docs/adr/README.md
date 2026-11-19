# Architecture decision records

Each file records one decision: the context in which it was made, what was
decided, what was discarded and with what consequence.

The purpose is to answer "why is it like this?" months later, without relying
on memory. A revised decision is not erased: a new ADR supersedes the old one,
and the old one's status changes to *superseded by NNN*.

| # | Decision | Status |
|---|---|---|
| [001](001-local-cli-instead-of-mcp.md) | Local CLI instead of an MCP server | accepted |
| [002](002-vault-as-source-of-truth.md) | The vault on disk is the source of truth | accepted |
| [003](003-local-embeddings-with-ollama.md) | Local embeddings with Ollama | accepted |
| [004](004-single-sqlite-index.md) | One SQLite file for the manifest, FTS5 and vectors | accepted |
| [005](005-hybrid-search-with-rrf.md) | Hybrid search fused by RRF | accepted |
| [006](006-incremental-indexing-by-hash.md) | Incremental indexing by hash | accepted |
| [007](007-index-inside-the-vault.md) | The index lives inside the vault | accepted |
| [008](008-heading-guided-chunking.md) | Heading-guided chunking | accepted |
| [009](009-on-demand-reconciliation.md) | On-demand reconciliation, no daemon | accepted |
| [010](010-optional-explicit-git.md) | Optional, explicit Git | accepted |
| [011](011-node-typescript-runtime.md) | Node.js and TypeScript as the runtime | accepted |

## Format

Title, status with date, and four sections: **Context**, **Decision**,
**Alternatives considered** and **Consequences**.

The alternatives section is the one that gains value over time. Recording what
was discarded and why avoids redoing the same analysis, and makes it clear when
a premise has changed enough to reopen the discussion.

## Language

ADRs 001–011 were written in Portuguese and translated to English on
2026-11-19, when the project adopted English as its only language. The
translation changed wording only; no decision, alternative or consequence was
altered.
