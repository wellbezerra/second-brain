# Spec 05 — Incremental indexing

**Commit:** `feat: incremental vault indexing`
**Depends on:** [02](02-vault-reading-and-chunking.md),
[03](03-local-embeddings.md), [04](04-index-schema.md)
**Reference decision:** [ADR 006](../adr/006-incremental-indexing-by-hash.md)

## Goal

Connect the three previous pieces: read the vault, find out what changed,
generate embeddings only for what changed and write. This is the first commit
in which the project does something useful end to end.

## Scope

**In:** change detection, pipeline orchestration, `brain index`, `--rebuild`.

**Out:** searching (06), repairing divergence (08).

## Change detection

For each `.md` in the vault, compared with the manifest:

| Case | Detection | Action |
|---|---|---|
| new | absent from the manifest | index |
| changed | hash differs | delete old chunks, reindex |
| unchanged | hash matches | skip |
| removed | in the manifest, absent from disk | delete chunks and row |

**`mtime` shortcut.** If `mtime` and `size` match the manifest, the file is not
read and the hash is not computed. It is an optimisation, never the decision:
any difference in `mtime` or `size` leads to a read and a hash, and the hash
decides. This covers `touch` and backup restores, which change `mtime` without
changing content — in those cases the file is read, the hash matches, and
nothing is reindexed.

## Pipeline

```
walk vault
   └─ for each note, classify (new / changed / unchanged / removed)
         └─ for the ones going in:
               read → chunking → batched embeddings → write in a transaction
   └─ for the removed ones: drop_file
   └─ write meta.last_index_at
```

Embeddings are the bottleneck, so they are requested in batches that cross file
boundaries: 200 chunks from 15 notes become a handful of Ollama calls, not 15.

**One transaction per note.** Each note is committed when it finishes.
Interrupting with Ctrl-C in the middle of a large vault leaves the notes already
processed indexed and the rest untouched — running again resumes where it left
off, because the manifest already records what was done. A single transaction
for the whole vault would lose all the work on every interruption.

## Interface

```
brain index [--vault P] [--rebuild] [--dry-run] [--quiet] [--json]
```

- `--rebuild` — deletes the index and reindexes everything. It is the way out
  for a model change, a chunking parameter change and any suspicion of
  corruption. Asks for confirmation when the index has more than 100 notes,
  unless `--quiet`.
- `--dry-run` — classifies and reports, without generating embeddings or
  writing.

Normal output:

```
12 new notes, 3 changed, 1 removed, 2,044 unchanged
184 chunks indexed · 6.2s
```

With `--json`, the same in JSON, for scripts.

## Progress and errors

A large vault takes minutes on the first indexing. Without a sign of progress,
it looks frozen — so the default shows progress (`47/312 notes`), suppressible
with `--quiet`.

An error in one note (unreadable, broken encoding) is recorded and indexing
continues. The final report lists the failures. A failure to generate embeddings
is different: it means Ollama is down or overloaded, and in that case the
command stops, because carrying on would only produce a list of identical
errors.

## Acceptance criteria

- The first run on a vault of N notes indexes all N.
- A second run with no changes reports N unchanged and **does not call Ollama
  even once**.
- Changing one note reindexes only that note; the total chunk count reflects the
  change.
- Deleting a note removes its chunks from all three tables.
- `touch` on a note does not change the index.
- Renaming a note shows up as one removal and one addition (known limitation,
  recorded in ADR 006).
- Ctrl-C in the middle leaves the index consistent, and the next run completes.
- `--rebuild` with a model of a different dimension works without error.

## Tests

A temporary vault manipulated by the test and a `HashEmbedder` instrumented to
count calls.

The test that matters most is the second run: index, index again, assert that
the embedder call counter did not go up. It protects the performance premise of
the whole project, and it is the first to break if anyone touches change
detection.

Also cover: `touch` without a content change; a change that alters the size; a
change that keeps the size (swapping one character for another); a deleted
note; a whole deleted folder.
