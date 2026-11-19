# ADR 004 — One SQLite file for the manifest, FTS5 and vectors

**Status:** accepted · 2026-11-19

## Context

The index has to hold three things: the manifest of files already processed, a
text index for keyword search and a vector index for search by meaning. In the
original project these were three Cloudflare services — D1, FTS inside D1 and
Vectorize.

## Decision

Everything lives in a single SQLite file, with FTS5 (built into SQLite) for
text and the [`sqlite-vec`](https://github.com/asg017/sqlite-vec) extension for
vectors.

The `chunks`, `chunks_fts` and `chunks_vec` tables share the same `rowid`,
which is `chunks.id`. That keeps the three aligned by construction and makes
deleting a chunk three `DELETE`s by the same id.

## Alternatives considered

**Chroma, LanceDB or Qdrant.** Rejected. All of them handle the vector side
well, but none handles the keyword side, so I would have two stores to keep in
sync — and keeping two databases in sync is exactly the class of bug I want to
avoid. Qdrant would also need a running process.

**An in-memory vector index rebuilt on every call.** Rejected. For 2,000 notes
it would even work, but it would pay a full read of the vault on every search,
which kills the latency target.

**FAISS in a file plus SQLite for the rest.** Rejected. Two files that can
diverge, and FAISS has no cheap way to delete an individual vector.

## Consequences

- One transaction covers all three tables. Either a chunk enters all three
  indexes or none. There is no partial state.
- One file to back up, copy or delete.
- `sqlite-vec` does a linear scan (brute force), with no approximate index. At
  the target scale — tens of thousands of chunks — that is fast enough and has
  the advantage of exact recall. If the vault grows to the point where it
  hurts, the way out is to partition by folder or swap the extension, not to
  rewrite the rest.
- Python must be able to load SQLite extensions (`enable_load_extension`). On
  some system Pythons on macOS this is disabled; installation has to check for
  it and warn early.
- FTS5 is configured with `remove_diacritics 2`, so that a query typed without
  accents matches accented text.
