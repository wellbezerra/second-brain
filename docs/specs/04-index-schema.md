# Spec 04 — Index schema

**Commit:** `feat: SQLite index schema with FTS5 and sqlite-vec`
**Depends on:** [01](01-skeleton-and-configuration.md)
**Reference decision:** [ADR 004](../adr/004-single-sqlite-index.md),
[ADR 012](../adr/012-read-only-vault.md)

## Goal

Create the index file and its access layer. Open, migrate, insert, delete and
count — with no indexing rules, which belong to spec 05.

## Scope

**In:** schema, connection, migration, write operations, `brain status`.

**Out:** deciding what to index (05), searching (06).

## Connection

The file lives at `<data-dir>/brain/<vault-id>/index.db`, outside the vault
([spec 01](01-skeleton-and-configuration.md)). On open:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
```

The `sqlite-vec` extension is loaded right after opening, and extension loading
is disabled immediately afterwards. If Python does not allow loading
extensions, the message must say so and point to `brain doctor`, because it is
a limitation of the interpreter and not something the project can fix on its
own.

## Tables

```sql
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- keys: schema_version, dim, model, last_index_at

CREATE TABLE files (
    id         INTEGER PRIMARY KEY,
    path       TEXT    NOT NULL UNIQUE,   -- relative to the vault root
    hash       TEXT    NOT NULL,          -- sha256 of the content
    mtime      REAL    NOT NULL,
    size       INTEGER NOT NULL,
    title      TEXT,
    indexed_at REAL    NOT NULL
);

CREATE TABLE chunks (
    id      INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    ord     INTEGER NOT NULL,
    heading TEXT,
    text    TEXT    NOT NULL,
    UNIQUE (file_id, ord)
);

CREATE INDEX chunks_by_file ON chunks(file_id);

CREATE VIRTUAL TABLE chunks_fts USING fts5(
    text,
    heading,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE chunks_vec USING vec0(
    chunk_id  INTEGER PRIMARY KEY,
    embedding float[<dim>]
);
```

## The central invariant

**`chunks.id` = `chunks_fts.rowid` = `chunks_vec.chunk_id`.**

That is what keeps the three tables aligned without synchronisation code:
inserting is writing the same id into all three, deleting is three `DELETE`s by
the same id. Every write happens inside a transaction, so there is no chunk that
is in two tables and missing from the third.

It is worth stating here because it is what `reconcile` (spec 08) checks, and it
is the first thing to suspect when search returns something strange.

## Dimension

`chunks_vec` can only be created once the dimension is known, and the dimension
comes from the model. So:

- the table is created lazily, on the first indexing;
- the dimension is stored in `meta.dim`;
- opening the index with a model of a different dimension is an error, with a
  message telling the user to run `brain index --rebuild`. Never a silent
  rebuild: reindexing a large vault is expensive and must be the user's choice.

Read-only commands (such as `status` on an empty index) open without a
dimension and work without the vector table.

## Operations

| Function | What it does |
|---|---|
| `connect(path, dim=None)` | opens, loads the extension, migrates |
| `manifest(conn)` | map `path -> row`, to compare against the disk |
| `upsert_file(...)` | writes to the manifest and **deletes the old chunks**, returning the id |
| `insert_chunks(conn, file_id, chunks, embeddings)` | inserts into the three tables |
| `drop_file(conn, file_id)` | deletes the note and everything derived from it |
| `counts(conn)` | counts of the four tables, used by `status` and `reconcile` |

`upsert_file` deleting the old chunks is not a hidden side effect: it is what
makes reindexing a note a single operation, with no window in which the note is
in the manifest with stale chunks.

## `brain status`

Prints: the vault path, model and dimension, note and chunk counts, index size,
when the last indexing ran and **how many notes changed on disk since then**.

That last number is what makes the limitation in
[ADR 009](../adr/009-on-demand-reconciliation.md) visible: search answers for
the last indexing, not for the disk.

## Acceptance criteria

- Opening a non-existent path creates the file and the directory.
- Opening twice does not duplicate tables or lose data.
- `insert_chunks` with different counts of chunks and vectors raises an error
  before writing anything.
- `drop_file` leaves the four counts consistent.
- Reopening with a different dimension raises an error mentioning `--rebuild`.
- `status` works on a freshly created, empty index.

## Tests

A database in a temporary file and `HashEmbedder`. Insert, delete and check that
the counts of the three tables match at each step. An explicit test of the
invariant: after a sequence of inserts and deletes, the set of ids in `chunks`,
`chunks_fts` and `chunks_vec` is identical.
