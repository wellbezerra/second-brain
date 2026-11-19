# ADR 007 — The index lives inside the vault

**Status:** accepted · 2026-11-19

## Context

The `index.db` file needs a home. Convention would point to
`~/.local/share/brain/` or the XDG equivalent, with the vault path stored in the
configuration.

## Decision

The index lives at `<vault>/.brain/index.db`.

`.brain/` goes into the vault's `.gitignore` and into the list of folders the
indexer skips.

## Alternatives considered

**`~/.local/share/brain/<vault-hash>/index.db`.** Rejected. It follows the
convention, but it leaves an orphaned index every time I move, rename or delete
a vault. And with two vaults I need a path-to-index mapping that can go stale on
its own.

**One global index covering several vaults.** Rejected. It would mix contexts I
want kept apart and make "delete and reindex" an expensive operation.

## Consequences

- The index follows the vault: moving the folder breaks nothing, deleting the
  folder leaves no debris.
- Different vaults are naturally isolated, with no configuration.
- The index must be excluded from Git and from the indexer itself. Forgetting
  this produces an obvious loop (indexing the index) and noise in the history —
  so `.brain/` goes into the default exclusion list, not an optional setting.
- Does Obsidian show hidden folders? Not by default, so `.brain/` does not
  clutter the interface. Same reasoning as `.obsidian/`.
- A backup of the vault takes the index along. It is redundant, since the index
  is derived, but the cost is small and the alternative would be asking the
  user to configure a backup exclusion.
