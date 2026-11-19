---
title: Brain architecture
tags: [brain, sqlite, architecture]
status: active
---

# Brain architecture

Brain indexes this vault and answers hybrid searches. See [[hybrid-search]] for
how the two rankings are fused and [[2026-03-14]] for the queue discussion.

## Index

One SQLite file holds the manifest, the FTS5 table and the `sqlite-vec` table.
The three share the same row id, so a chunk is either in all three or in none.

### Manifest

The `files` table stores the relative path, the sha256 of the content, the
mtime and the size. The mtime is only a shortcut; the hash decides whether a
note changed.

## Chunking

Notes are split by heading. Each chunk carries its heading path, for example
`Brain architecture > Index > Manifest`, which gives short chunks context.

```sh
# rebuild the index from scratch after changing the model
brain index --rebuild
# this line starts with a hash but is a shell comment, not a heading
```

## Decisions

- No daemon and no file watcher; `brain index` runs on demand.
- Embeddings come from Ollama on localhost, so nothing leaves the machine.
- The vault is read-only: the index lives in the user data directory.
