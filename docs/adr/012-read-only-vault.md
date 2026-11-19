# ADR 012 — The vault is read-only to Brain

**Status:** accepted · 2026-11-19
**Supersedes:** [ADR 007](007-index-inside-the-vault.md), [ADR 010](010-optional-explicit-git.md)

## Context

The vault is the user's real personal data. Three earlier decisions had Brain
write into it:

- [ADR 007](007-index-inside-the-vault.md) put the index at
  `<vault>/.brain/index.db` and had `brain init` edit the vault's `.gitignore`;
- [spec 07](../specs/07-note-creation.md) added `brain save`, which creates and
  appends to notes;
- [ADR 010](010-optional-explicit-git.md) and [spec 09](../specs/09-git-history.md)
  had those writes committed to the vault's Git repository.

Every write path is a way to damage data that has no other copy guaranteed, and
every one has to be defended in code and in tests. The project is also built
with a coding agent whose context includes vault content; a note can contain
text shaped like an instruction. Keeping the vault out of reach of any write is
the simplest guarantee that such text cannot cause one.

## Decision

Brain never writes to the vault. No file, no folder, no `.gitignore` edit, no
Git operation. It only reads `.md` files and `stat`s them.

The index lives outside the vault, in the user data directory:

| Platform | Location |
|---|---|
| Linux, macOS | `$XDG_DATA_HOME/brain/<vault-id>/index.db` (default `~/.local/share/brain/…`) |
| Windows | `%LOCALAPPDATA%\brain\<vault-id>\index.db` |

`<vault-id>` is the first 16 hex characters of the `sha256` of the vault's
resolved real path. Next to `index.db`, a `vault.json` records that path, so an
index can always be traced back to its vault.

Note creation (spec 07) and Git history (spec 09) are withdrawn. Capture
happens in Obsidian, which is already the editor.

Vault content is data, never instruction. Nothing Brain reads from a note
changes what Brain does.

## Alternatives considered

**Keep the index inside the vault.** Rejected. It is the convenience ADR 007
chose, but it is a write into personal data on every indexing, plus a
`.gitignore` edit.

**Keep `brain save` behind an opt-in flag.** Rejected. A single write path is
enough to need all the defences (path traversal, collisions, partial writes),
and the friction it removes is small: Obsidian has quick capture.

**Index next to the configuration, in `~/.config/brain/`.** Rejected. The index
is disposable data, not configuration; XDG separates the two for good reasons
(backups, sync of dotfiles).

## Consequences

- No test needs to defend against corrupting a note; a test can assert that the
  vault is byte-identical before and after any command.
- Moving or renaming the vault changes `<vault-id>`: the next `brain index`
  builds a new index from scratch, and the old one is orphaned. Accepted — the
  index is derived and disposable ([ADR 002](002-vault-as-source-of-truth.md)).
  `brain status` shows the index path; pruning orphans is deferred.
- Deleting a vault leaves its index behind until it is pruned. `vault.json` is
  what makes that pruning safe to build later.
- `.brain/` no longer needs to be excluded from the walk or from the vault's
  Git, and `brain init` only writes Brain's own configuration.
- The capture use case from the ROADMAP ("stop after 7: capture and search")
  disappears. Brain is a search tool; Obsidian is the editor.
