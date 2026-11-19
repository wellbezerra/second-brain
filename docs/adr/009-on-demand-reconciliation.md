# ADR 009 — On-demand reconciliation, no daemon

**Status:** accepted · 2026-11-19

## Context

Obsidian writes to the vault without telling Brain. Between one indexing and
the next, the index goes stale. The original project solves this with an
indexing queue and a reconciliation workflow running every day at 04:00 UTC.

I need to decide how the index stays close to the disk.

## Decision

Nothing runs on its own. Two explicit commands cover the subject:

- **`brain index`** — incremental pass. Compares the disk with the manifest and
  applies the differences. It is the everyday command, cheap enough to run
  often.
- **`brain reconcile`** — deep check. Compares the three sources (disk, manifest
  and chunk tables) and reports every divergence: an orphaned chunk with no
  file, a file in the manifest with no chunks, misalignment between `chunks`,
  `chunks_fts` and `chunks_vec`, a diverging hash. By default it only reports;
  with `--fix`, it repairs.

Scheduling `brain index` in cron or launchd is up to the user, and is
documented — but the project does not install it.

## Alternatives considered

**File system watcher.** Rejected. It needs a resident process, which is
exactly what [ADR 001](001-local-cli-instead-of-mcp.md) eliminated. Dropping it
removes a whole class of problems: a dead process nobody notices, lost,
duplicated or out-of-order events, and the erratic behaviour of watchers on
folders synced by iCloud or Dropbox.

**Automatically index before every search.** Rejected as the default, because it
makes search latency unpredictable: usually instant, occasionally fifteen
seconds. Available as `brain search --fresh` for when I want the guarantee.

**Asynchronous queue, as in the original.** Rejected. The queue exists there to
take indexing off the critical path of a concurrent remote write. Here writing
is local and sequential, and the cost of the queue would be eventual
consistency with no gain in return.

## Consequences

- Search is consistent with the **last indexing**, not with the disk. That is
  the central limitation of the design and it has to be visible: `brain status`
  shows when the last indexing ran and how many notes changed since.
- No resident process, no lifecycle management, no daemon logs to dig through.
- `reconcile` separates diagnosis from repair. I want to look at the divergence
  before telling the program to touch the index — when the index looks wrong,
  the cause matters more than the fix.
- Unlike the original, there is no mandatory periodic reconciliation, because
  there is no queue that can lose a message. Drift here has a single cause:
  editing outside the CLI.
