# Spec 07 — Note creation from the CLI

**Commit:** `feat: note creation from the CLI`
**Depends on:** [05](05-incremental-indexing.md)
**Reference decision:** [ADR 002](../adr/002-vault-as-source-of-truth.md)

## Goal

Capture an idea without opening Obsidian. The friction between having a thought
and recording it is what decides whether a second brain gets fed or abandoned,
so the path has to be a short command.

## Scope

**In:** `brain save`, a daily journal, named notes, input from stdin, immediate
indexing of what was written.

**Out:** editing an existing note (Obsidian does that), deleting a note, Git
commits (spec 09).

## Interface

```
brain save "text of the idea" [--tag t]... [--title T] [--note P] [--open]
echo "text" | brain save
brain save            # no argument and no pipe: opens $EDITOR
```

Three destinations, in this order of precedence:

1. `--note Projects/brain.md` — appends to the end of the given file, creating
   it if it does not exist.
2. `--title "Queue decision"` — creates a new note with that title, at a path
   derived from the title.
3. default — appends to the day's note, `Journal/YYYY-MM-DD.md`.

The journal as the default is deliberate: quick capture should not require
deciding where the thing lives. Organising later, in Obsidian, is cheap;
deciding at capture time is the friction that kills the habit.

## Format of what is written

A new note gets minimal front matter:

```markdown
---
title: Queue decision
created: 2026-11-19T09:30:00-03:00
tags: [architecture, sqlite]
---

text of the idea
```

An append to an existing note goes in as a new section, with the time:

```markdown

## 09:30

text of the idea
```

Existing front matter is never rewritten. Appending means appending to the end
of the body — rewriting the header of a file Obsidian also edits invites
conflicts.

## Path derived from the title

The title's slug: lowercase, accents removed, non-alphanumerics become hyphens,
repeated hyphens collapse. `Café notes: naïve résumé` becomes
`cafe-notes-naive-resume.md`.

A collision does not overwrite. It adds a numeric suffix: `-2`, `-3`. Losing an
existing note because a title repeated would be the worst possible defect in a
tool whose purpose is keeping things.

## Path safety

`--note` takes a path from the user, so it has to be validated: resolved against
the vault root and refused if it lands outside. `--note ../../etc/something` is
an error, not a write.

## Indexing

After writing, the affected note is indexed immediately — only that note, not the
whole vault. Whoever saved just created the information and may want to search
for it right away; waiting for the next `brain index` would be surprising.

If indexing fails (Ollama down), **the note stays written** and the command
warns that it will be out of search until the next indexing. The note is what
matters; the index is derived and rebuildable.

## Acceptance criteria

- `brain save "x"` with no prior journal setup creates `Journal/` and the day's
  note.
- Two `save`s on the same day produce two sections in the same file.
- `--title` with accents produces a slug without accents.
- A colliding title produces `-2`, without touching the existing file.
- `--note` outside the vault is refused.
- Piping through stdin works; empty text is refused with a message.
- With no argument and no pipe, it opens `$EDITOR`; quitting without saving
  aborts without creating a file.
- With Ollama down, the note is written and the warning appears.
- After `save`, `brain search` finds the text.

## Tests

A temporary vault. Cover: journal creation, appending to an existing journal, a
slug with accents and punctuation, a name collision, escaping the vault with
`..`, empty stdin, an embedder failure during `save`.

The `..` test deserves to be explicit and named: it is the only user input that
becomes a file path in the whole project.
