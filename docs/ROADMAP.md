# Roadmap — eight features

Each feature is a spec and becomes **one commit**. The order respects the
dependencies: no commit depends on something that does not exist yet, and each
one leaves the test suite green.

Specs 07 (note creation) and 09 (Git history) are **withdrawn**: both wrote to
the vault, which [ADR 012](adr/012-read-only-vault.md) forbids. Their numbers
are kept so links stay stable.

## The sequence

| # | Commit | Spec | Depends on |
|---|---|---|---|
| 1 | `feat: project skeleton and vault configuration` | [01](specs/01-skeleton-and-configuration.md) | — |
| 2 | `feat: vault reading and Markdown chunking` | [02](specs/02-vault-reading-and-chunking.md) | 1 |
| 3 | `feat: local embeddings via Ollama` | [03](specs/03-local-embeddings.md) | 1 |
| 4 | `feat: SQLite index schema with FTS5 and sqlite-vec` | [04](specs/04-index-schema.md) | 1 |
| 5 | `feat: incremental vault indexing` | [05](specs/05-incremental-indexing.md) | 2, 3, 4 |
| 6 | `feat: hybrid keyword and semantic search` | [06](specs/06-hybrid-search.md) | 5 |
| 8 | `feat: index reconciliation` | [08](specs/08-reconciliation.md) | 5 |
| 10 | `feat: packaging, installation and search evaluation` | [10](specs/10-packaging-and-evaluation.md) | all |

```
1 ─┬─ 2 ─┐
   ├─ 3 ─┼─ 5 ─┬─ 6 ─┬─ 10
   └─ 4 ─┘     └─ 8 ─┘
```

Commits 2, 3 and 4 are independent of each other — they can be done in any
order, or in parallel. So are commits 6 and 8.

## Where the project starts being useful

**Commit 5** is the first end-to-end one: it indexes a real vault. It does not
search yet, but you can already look at the index and confirm that chunking
makes sense.

**Commit 6** is the moment the project justifies its own existence. From there
on daily use is possible, and commits 8 and 10 close the gaps.

If the urge to use it outweighs the urge to finish, stopping after 6 is an
honest option: you can search. 8 and 10 are what make the project sustainable
instead of a prototype that worked once.

> **Runtime.** The project is Node/TypeScript ([ADR 011](adr/011-node-typescript-runtime.md)).
> Specs 02 to 10 still mention Python (`pytest`, `httpx`, `pip`); each one is
> corrected in the commit that implements it.

## Rules for each commit

- **Test before code.** The failing test goes in its own commit, before the
  implementation. This applies above all to the second-indexing test (spec 05)
  and to the lying-`mtime` test (spec 08) — both describe behaviour that is easy
  to break without noticing.
- **Green suite at the end of every commit.** No "fix it in the next one".
- **No test requires Ollama.** `HashEmbedder` exists for that since spec 03.
  Breaking this rule makes CI impossible.
- **A changed decision changes the ADR.** An accepted ADR is not edited: a new
  one supersedes it. The spec, on the other hand, may be corrected when the
  implementation reveals it was wrong — and it usually does.
- **Nothing below the CLI prints.** The boundary from spec 01 is what keeps the
  door open for an API or an MCP server later.

## Deferred

Recorded here so it does not become hidden scope along the way:

- **Rename detection.** Today a rename is a removal plus an addition, and it
  reindexes for nothing. Solvable by matching orphaned hashes
  ([ADR 006](adr/006-incremental-indexing-by-hash.md)).
- **Local HTTP API.** The structure already allows it; the use case is missing.
- **MCP server.** It would close the circle with the original project, now by
  choice and not by inheritance.
- **Pruning orphaned indexes.** Moving or deleting a vault leaves its index in
  the data directory; `vault.json` makes a safe `brain prune` possible
  ([ADR 012](adr/012-read-only-vault.md)).
- **Cross-encoder reranking.** Only makes sense after `brain eval` shows where
  ordering goes wrong ([ADR 005](adr/005-hybrid-search-with-rrf.md)).
- **Backlinks and graph.** Obsidian already does it; only worth it if search
  needed them for ranking.

## Open questions

Nothing here blocks commit 1. These are questions the implementation will answer
better than I can now:

1. **Is 1,200 characters the right chunk target?** Guessed from what is common.
   `brain eval` from spec 10 will tell.
2. **`bge-m3` or a smaller model?** `bge-m3` is good and multilingual, but heavy.
   If initial indexing takes too long on this machine, `nomic-embed-text` is the
   alternative to measure.
3. **`heading` weight in BM25.** Starts at 2× the weight of `text`, by instinct.
   Also something to measure.
