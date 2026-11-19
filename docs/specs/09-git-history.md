# Spec 09 — Optional Git history

**Commit:** `feat: optional Git history of the vault`
**Depends on:** [07](07-note-creation.md)
**Reference decision:** [ADR 010](../adr/010-optional-explicit-git.md)

## Goal

When the vault is a Git repository and automatic commit is on, the writes made
by the CLI become commits with useful messages.

It is the smallest feature of the set and the only entirely optional one. It
comes after everything that writes notes, because it is an addition to `save`,
not a prerequisite for it.

## Scope

**In:** repository detection, commit after write, configuration, `brain log`.

**Out:** push, pull, conflict resolution, initialising a repository. Brain does
not manage Git; it records its own writes in a Git that already exists.

## Behaviour

Active only when both conditions hold:

1. the vault is a Git repository (there is a `.git` at the root or above);
2. `git: true` in the configuration, or `--git` on the call.

The default is off.

When active, after a successful write: `git add` of the affected file and
`git commit` of that file only. Never `git add -A` — the vault may have changes
from Obsidian that are not this command's, and sweeping them into a commit about
something else misattributes work in the history.

Messages:

| Operation | Message |
|---|---|
| new note | `note: <title>` |
| journal append | `journal: <YYYY-MM-DD>` |
| append to an existing note | `note: <title> (append)` |

`brain index` never commits. It does not change notes, and the index is in
`.gitignore`.

## A failure never loses the note

This is the rule that governs the feature. When the commit fails — a merge
conflict, a rebase in progress, the user's hook rejecting, `user.email` not
configured — the note **is already on disk**. The failure is a warning:

```
Note written to Journal/2026-11-19.md
⚠ could not commit: pre-commit hook returned 1
  The note is saved; commit it by hand if you want.
```

Exit code 0. The requested operation — saving the note — was completed.

## `brain log`

```
brain log [-n 20] [--note P]
```

A shortcut over `git log` restricted to the vault, or to one note. It exists to
close the loop: if history is being created, it should be possible to look at it
without leaving the tool.

With `--note`, it lists that file's revisions. Useful to answer "when did I
change my mind about this".

## Implementation

`subprocess` calling the system `git`. No library.

The project performs four Git operations — `rev-parse`, `add`, `commit`, `log` —
and pulling in a dependency that reimplements Git for that would be
disproportionate. `git` is already installed on any machine that will use this.

Care points: never interpolate a path into a shell string (always an argument
list); set `cwd` to the vault root; a timeout, so a hung hook does not hang the
CLI.

## Acceptance criteria

- Vault without Git: `save` works normally, with no error and no mention of Git.
- Vault with Git and `git: false`: no commit is created.
- Vault with Git and `git: true`: each `save` creates exactly one commit,
  containing only the affected file.
- Unrelated pending changes in the vault do not go into the commit.
- A failing commit does not prevent the note from being written, and the exit
  code is 0.
- Paths with spaces or accents are handled correctly.
- `brain log --note P` lists that file's revisions.

## Tests

A temporary Git repository created by the test, with local `user.name` and
`user.email`.

Cover: a commit created with the right message; only the expected file in the
commit; an unrelated dirty file stays out and is still dirty afterwards; a
`pre-commit` hook returning 1 produces a warning and exit 0, with the note on
disk; a vault without Git does not attempt a commit.
