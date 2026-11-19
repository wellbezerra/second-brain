# ADR 010 — Optional, explicit Git

**Status:** accepted · 2026-11-19

## Context

In the original project, every change becomes an automatic commit — that is
what provides history and allows undoing. Here the vault is a local folder, and
Git on top of it is a choice, not a consequence of the architecture.

There is a real tension: an automatic commit per saved note produces granular
history, but it floods the log with hundreds of one-line commits and gets in the
way if I want to use the vault's Git for something else.

## Decision

The vault **may** be a Git repository. Brain does not require it and does not
initialise anything on its own.

When the vault is a repository and automatic commit is turned on in the
configuration (`git: true`, off by default), the commands that write notes
commit the changes, with a message derived from the operation.

`brain index` never commits: it does not change notes, only the index, and the
index is in `.gitignore`.

## Alternatives considered

**Always commit automatically, as in the original.** Rejected as the default.
There, the commit is the only form of history in a shared remote collection.
Here I have Time Machine, file system snapshots and Obsidian's own version
history. The commit becomes redundant and noisy.

**Never touch Git at all.** Rejected. It could be automated from outside with a
hook or cron, but then the commit message loses the operation's context:
"automatic update" instead of "note: sqlite-vec and cosine".

**Group commits by session or by day.** Rejected for now. It would need to track
the start of a session without a daemon, which does not fit the current design.

## Consequences

- Whoever does not want Git pays nothing for it: the default is off, and no
  command fails because there is no repository.
- History, when on, is granular and has useful messages.
- `.brain/` must be in `.gitignore`, otherwise every indexing would dirty the
  repository with a large binary. `brain init` writes that line, and warns if it
  could not.
- Git operations can fail for reasons unrelated to Brain: a merge conflict, a
  repository mid-rebase, the user's own hook rejecting the commit. The note **has
  already been written** at that point, so a commit failure is a warning, never
  an error that discards the work.
- Syncing between machines through Git becomes viable later, with no design
  change — but it is out of scope for now ([SPEC](../SPEC.md), "What Brain is
  not").
