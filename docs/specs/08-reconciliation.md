# Spec 08 — Reconciliation

**Commit:** `feat: index reconciliation`
**Depends on:** [05](05-incremental-indexing.md)
**Reference decision:** [ADR 009](../adr/009-on-demand-reconciliation.md)

## Goal

Check whether the index matches the vault and itself, report the divergences
and, on request, fix them.

It is the project's diagnostic tool: when search returns something strange, this
is where you find out why.

## Scope

**In:** the four checks, the report, `--fix`, `brain reconcile`.

**Out:** automatic or scheduled runs — out of scope by decision, not for lack of
time.

## The four checks

Three sources have to agree: the disk, the manifest (`files`) and the chunk
tables (`chunks`, `chunks_fts`, `chunks_vec`).

| # | Divergence | How it shows up | Likely cause | `--fix` |
|---|---|---|---|---|
| 1 | note on disk, missing from the manifest | walk minus manifest | never indexed | index |
| 2 | note in the manifest, missing from disk | manifest minus walk | deleted outside the CLI | remove chunks and row |
| 3 | manifest hash differs from disk | reread and hash | edited outside the CLI | reindex |
| 4 | chunks misaligned across the three tables | comparison of id sets | interruption mid-write, or a bug | reindex the note |

The fourth is the one that checks the invariant from
[spec 04](04-index-schema.md): the set of ids in `chunks`, `chunks_fts` and
`chunks_vec` must be identical. It also catches an orphaned chunk whose
`file_id` no longer exists in `files`.

Check 3 rereads and rehashes the **whole** vault, ignoring the `mtime` shortcut
that [spec 05](05-incremental-indexing.md) uses. That is why `reconcile` is a
separate command from `index`: it is slow by construction, and it exists for
exactly the case where `mtime` lied.

## Interface

```
brain reconcile [--fix] [--json] [--quiet]
```

Without `--fix`, it only reports and writes nothing to the index. Exit code 0 if
everything is aligned, 1 if it found a divergence — which allows using it in
scripts.

```
Reconciliation of ~/Documents/notes

  ✓ 2,041 notes aligned
  ✗ 2 notes on disk that are not in the index
      Projects/ideas.md
      Journal/2026-11-18.md
  ✗ 1 note in the index that no longer exists on disk
      Archive/old.md
  ✗ 1 note with 12 chunks in chunks, 12 in fts, 11 in vec
      Projects/brain.md

4 divergences. Run `brain reconcile --fix` to fix them.
```

Reporting before fixing is the point of the design. When the index looks wrong,
the cause matters more than the fix: three diverging notes suggest outside
edits, three hundred suggest a bug of mine.

## Fixing

With `--fix`, each divergence is fixed by the action in the table above, one
transaction per note, with a report of what was done.

If more than 20% of notes diverge, the command stops and suggests `--rebuild`
instead of fixing them one by one. Divergence at that scale points to a systemic
cause — a model change, a chunking change, corruption — and rebuilding is faster
and more reliable than patching.

## Acceptance criteria

- A freshly built index: zero divergences, exit 0.
- A note created outside the CLI is detected as case 1 and, with `--fix`,
  indexed.
- A note deleted outside the CLI is detected as case 2 and, with `--fix`,
  removed.
- A note edited while preserving `mtime` and size is detected as case 3 — which
  `brain index` would let through.
- A row removed by hand from `chunks_vec` is detected as case 4.
- Without `--fix`, nothing in the index changes.
- Exit 1 when there is a divergence, 0 when there is none.
- Divergence above 20% stops with the `--rebuild` suggestion.

## Tests

Divergences fabricated directly in SQLite and on the file system — the way to
simulate corruption that, by construction, normal code does not produce.

The case 3 test is the most valuable: edit the content while restoring `mtime`
and size with `os.utime`, confirm that `brain index` does not detect it and
that `brain reconcile` does. It documents, in executable code, why the two
commands exist separately.
