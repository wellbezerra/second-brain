# Spec 06 — Hybrid search

**Commit:** `feat: hybrid keyword and semantic search`
**Depends on:** [05](05-incremental-indexing.md)
**Reference decision:** [ADR 005](../adr/005-hybrid-search-with-rrf.md)

## Goal

Take a text query and return ordered chunks, combining FTS5 and vector
similarity into a single list.

This is the feature the project exists for.

## Scope

**In:** keyword search, vector search, RRF fusion, filters, `brain search`.

**Out:** cross-encoder reranking and answer generation — neither is in the
project's scope.

## The two engines

**Keyword.** `chunks_fts MATCH ?`, ordered by `bm25()`. The `heading` column gets
a higher weight than `text`, because a hit on the heading path is a stronger
signal than a hit on the body.

The user's query must be **escaped** before it becomes an FTS5 query. Quotes,
`*`, `-`, `OR`, `NEAR` and parentheses mean something in FTS5 syntax, and a
search for `C++` or for `foo - bar` must not break the command. The default is to
treat the query as literal terms; FTS5 syntax is available behind `--raw` for
whoever wants it.

**Vector.** The query is embedded by the same model and becomes a KNN over
`chunks_vec`. Since vectors are normalised, L2 distance orders the same as
cosine.

Each engine returns 3× the requested limit, so the fusion has material to work
with.

## Fusion

```
score(chunk) = Σ  1 / (60 + position_in_engine_i)
```

Positions start at 1. A chunk present in both lists accumulates both terms. Ties
are broken by the best individual position, then by the note path, so the
ordering is deterministic.

The result records where it came from (`fts`, `vec` or both), which is useful for
debugging search and for `--explain`.

## Filters

```
brain search "query" [-n 10] [--path "Projects/**"] [--since 2026-01-01]
                     [--mode hybrid|keyword|semantic] [--raw]
                     [--fresh] [--json] [--explain]
```

- `--path` — glob over the relative path.
- `--since` — notes modified from that date on.
- `--mode` — turns one of the engines off. Useful for comparing and debugging.
- `--fresh` — runs incremental indexing before searching
  ([ADR 009](../adr/009-on-demand-reconciliation.md)).
- `--explain` — shows the position in each engine and the score terms.

Filters are applied **before** fusion, in each engine, so that an engine's
top 30 cannot be discarded entirely by the filter and leave nothing.

## Output

```
1. Projects/brain.md  ·  Brain > Architecture > Decisions          fts+vec
   ...the queue absorbs write spikes and keeps indexing off the
   critical path of the write. The cost is eventual consistency...

2. Journal/2026-03-14.md  ·  Conversation with the team                vec
   ...
```

Path, heading path, origin and a snippet with the terms highlighted when the
terminal supports colour.

**The score is not shown by default.** An RRF score has no absolute meaning, and
showing it invites reading it as a relevance percentage, which is the wrong
reading. It stays behind `--explain`.

With `--json`, the output is structured, with absolute paths, for consumption by
another tool.

## Acceptance criteria

- Searching for a literal term present in a note finds the note.
- Searching for a paraphrase, with no term in common, finds the note (with a
  real model; does not apply with `FakeEmbedder`).
- A query with `"`, `*`, `-` or `C++` does not break.
- A query with no result returns an empty list and a clear message, not an
  error.
- `--mode keyword` does not call Ollama.
- Searching an empty index does not break.
- The ordering is deterministic for the same query and the same index.
- Latency under 300ms on a vault of 2,000 notes, embedding included.

## Tests

With `FakeEmbedder`, the semantic side cannot really be evaluated — so the tests
split:

- **Fusion unit tests**, with synthetic lists: a document in both lists beats
  those in only one; position 1 in one engine can beat position 3 in both; ties
  are deterministic; an empty list from one engine does not break.
- **Escaping unit tests**, with hostile queries: `"`, `*`, `(`, `OR`, `C++`, an
  empty string, only spaces, 500 characters.
- **Integration** of the full path, checking that the right note shows up,
  without asserting anything about the exact order.

Real semantic quality is measured by the reference query set in
[spec 10](10-packaging-and-evaluation.md), with a real model.
