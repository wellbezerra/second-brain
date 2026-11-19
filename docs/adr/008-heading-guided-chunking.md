# ADR 008 — Heading-guided chunking

**Status:** accepted · 2026-11-19

## Context

One embedding per whole note does not work: a 3,000-word note becomes an
average vector that resembles none of the subjects it covers. I need to split
it into chunks. The question is where to cut.

Markdown already carries an explicit section structure. Ignoring it to cut
every N characters throws away information the author provided for free.

## Decision

Splitting follows the headings. Each section becomes one or more chunks, and
each chunk carries the **heading path** above it, prefixed by the note title:

```
Project Alpha > Architecture > Decisions
```

That path goes into the text sent to the embedding model and also into an
indexed FTS5 column.

Sections larger than the target (~1,200 characters) are split by paragraph,
with an overlap of ~150 characters. A paragraph that alone exceeds the target is
cut by sentence, as a last resort.

## Alternatives considered

**Fixed size with overlap, ignoring structure.** Rejected. It is the default in
RAG libraries and works on running prose, but it wastes the structure Markdown
already has and produces chunks that start mid-sentence and end mid-sentence.

**One note, one embedding.** Rejected. It would only work if my notes were all
short and single-topic, and they are not.

**Semantic chunking (cut where embeddings of neighbouring sentences diverge).**
Rejected for now. It costs one embedding per sentence just to decide where to
cut, and the gain over heading-based splitting on a well-structured document is
small.

## Consequences

- The inherited context improves search considerably. A chunk that says
  "Rejected because of cost" is useless alone; with
  `ADR 004 > Alternatives > Qdrant` in front, it can be retrieved.
- A note with no heading becomes a single section, split by size. It works, it
  just does not get the extra context.
- The parser must ignore `#` inside code blocks, otherwise a shell script
  comment becomes a heading and shatters the note.
- Very short chunks (under ~60 characters) are discarded as noise, except for a
  note that is short as a whole — that one must produce at least one chunk, or
  it would vanish from search.
- The parameters (target, overlap, minimum) are module constants, not
  configuration. Changing them invalidates comparisons between indexes, so a
  change must be deliberate and accompanied by a reindex.
