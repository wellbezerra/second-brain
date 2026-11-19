# Spec 02 — Vault reading and Markdown chunking

**Commit:** `feat: vault reading and Markdown chunking`
**Depends on:** [01](01-skeleton-and-configuration.md)
**Reference decision:** [ADR 008](../adr/008-heading-guided-chunking.md)

## Goal

Turn a folder of `.md` files into a list of chunks ready to index. This feature
is pure: it reads files and returns data structures; it does not touch the
database or the network.

It is the most testable part of the project and the one that most affects
search quality, which justifies it coming early and alone.

## Scope

**In:** walking the vault, reading a note, front matter, splitting into chunks,
heading path.

**Out:** hash and manifest (spec 05), embeddings (spec 03), writing.

## Modules

- `vault.py` — walk the vault, read a note, extract the title.
- `chunk.py` — split text into chunks.

## Walking

Walks the vault recursively looking for `.md`. Skips:

- any path that goes through a folder in the exclusion list
- hidden folders and files (starting with `.`)
- symbolic links, to avoid any risk of cycles
- unreadable files, which become a warning, not an interruption

Returns paths **relative to the vault root**, in a stable order. The manifest
stores relative paths so that moving the vault does not invalidate the index.

## Note title

In order: the `title` field of the front matter, the first `#` heading in the
body, the file name without extension.

The title prefixes the heading path of every chunk of the note, which gives
context to chunks that sit under no heading.

## Front matter

Deliberately shallow parsing: only top-level `key: value` pairs, delimited by
`---` on the first line and on a later line.

I do not want YAML as a dependency to read a title and a few tags. Lists and
nested blocks are ignored without error. If the closing delimiter does not
exist, the whole file is treated as body.

The front matter does **not** go into the indexed text.

## Splitting into chunks

Target of 1,200 characters, overlap of 150, minimum of 60. Module constants, not
configuration — changing them invalidates comparisons between indexes.

Algorithm:

1. Separate front matter from body.
2. Walk the body accumulating the current heading path. A heading closes the
   previous section and opens another. **`#` inside a code block is not a
   heading** — the "inside a fence" state must be tracked.
3. Each section becomes one or more chunks:
   - below the target: one chunk;
   - above: split by paragraph, with overlap;
   - a paragraph that alone exceeds the target: split by sentence.
4. Build the final heading as `title > h1 > h2 > ...`, dropping empty levels (a
   note that jumps from `#` to `###`).
5. Discard chunks below the minimum, **except** when the note would otherwise
   produce no chunk at all — a short note must remain searchable.

The text sent to the embedding model is `heading + "\n\n" + text`; the heading
also goes into its own FTS5 column.

## Acceptance criteria

- A note without headings produces at least one chunk, with the title as
  heading.
- A note with nested headings produces the full path on the deepest chunk.
- `#` inside ```` ``` ```` does not split the note.
- An empty note, or one with only front matter, produces zero chunks, without
  error.
- A 10,000-character note with no paragraph break is split anyway.
- Returned paths are relative and stable between runs.
- `.obsidian/`, `.brain/` and `.git/` never show up in the walk.

## Tests

A sample vault in `tests/fixtures/vault/` covering: a simple note, a note with
nested headings, a note with a code block containing `#`, a note with only
front matter, a note without front matter, a long note, a note with accented
characters, a note inside `.obsidian/` that must be ignored.

Property tests worth having:

- concatenating a note's chunks recovers all of its meaningful content
  (allowing for overlap);
- no chunk exceeds the target by more than the largest indivisible paragraph;
- splitting is deterministic: same input, same output.
