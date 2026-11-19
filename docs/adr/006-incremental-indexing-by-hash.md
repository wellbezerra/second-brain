# ADR 006 — Incremental indexing by hash

**Status:** accepted · 2026-11-19

## Context

Generating embeddings is the expensive step of the pipeline. Reindexing a whole
vault on every command is not viable: with 2,000 notes, it would be thousands of
model calls each time. I need to know what changed since the last indexing.

## Decision

A `files` table acts as a manifest: for each indexed note it stores the
relative path, the `sha256` of the content, `mtime`, size and when it was
indexed.

On each `brain index`, the vault is walked and each note falls into one of four
cases:

| Case | Detection | Action |
|---|---|---|
| New | not in the manifest | index |
| Changed | hash differs | delete old chunks and reindex |
| Unchanged | hash matches | skip |
| Removed | in the manifest, not on disk | delete the chunks |

`mtime` is only a shortcut: if `mtime` and size match the manifest, the hash is
not even computed. It is an optimisation, not the source of the decision.

## Alternatives considered

**`mtime` only.** Rejected as the source of truth. `mtime` lies in several
common situations: `git checkout`, backup restore, file sync and `touch`. The
result would be changed notes that never reindex — a silent failure, which is
the worst category.

**Hash only, no `mtime` shortcut.** Rejected. Correct, but it would read 2,000
whole files on every command. The shortcut recovers almost all the cost without
giving up correctness, because the hash is still computed whenever there is any
doubt.

**Watching the file system.** Rejected, see
[ADR 009](009-on-demand-reconciliation.md).

## Consequences

- A `brain index` on an unchanged vault is essentially one `stat` per file. Fast
  enough to run before every search, if I want.
- The granularity is the file, not the chunk. Changing a comma in a note
  reindexes the whole note. Accepted: notes are small, and tracking chunk by
  chunk would require matching old chunks to new ones, which is far more complex
  and fragile than reindexing.
- Renaming a note shows up as a removal plus an addition. The content is
  reindexed for nothing. Detecting renames by hash is possible and is recorded
  as an improvement, but it is not in now.
- The manifest is what allows `reconcile` to exist: it compares the three
  sources (disk, manifest, chunks) and reports divergence.
