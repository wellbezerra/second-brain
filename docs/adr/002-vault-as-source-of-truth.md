# ADR 002 — The vault on disk is the source of truth

**Status:** accepted · 2026-11-19

## Context

I need to decide who is in charge: the `.md` files on disk or the database.
The answer determines what happens when the two disagree — and they will,
because Obsidian writes to the files without telling anyone.

## Decision

The Markdown files are the source of truth. The SQLite index is a **derived,
disposable artifact**.

In any divergence, the disk wins. Deleting `index.db` never loses information;
it only costs a reindex.

## Alternatives considered

**Database as the source of truth, files as an export.** Rejected. It would
break Obsidian as the editor: whatever I typed there would be overwritten or
ignored. It would also tie my notes to the internal format of a tool I wrote
myself and may abandon.

**Two sources with merging.** Rejected. Resolving conflicts between two live
sources is the kind of complexity that is only justified by multiple remote
writers — exactly what [ADR 001](001-local-cli-instead-of-mcp.md) took out of
scope.

## Consequences

- Obsidian works with no plugin, no configuration and no awareness that Brain
  exists. So does any text editor.
- Index corruption, an embedding model change, a chunking bug and a schema
  change all have the same fix: delete and reindex. That simplifies error
  handling considerably.
- Edits made outside the CLI only show up in search after a `brain index`.
  There is no file system watching ([ADR 009](009-on-demand-reconciliation.md)).
- The notes outlive the project. If I drop Brain tomorrow, I still have a
  folder of Markdown.
