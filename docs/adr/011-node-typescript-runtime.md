# ADR 011 — Node.js and TypeScript as the runtime

**Status:** accepted · 2026-11-19

## Context

The specs were written with Python in mind: `argparse`, `httpx`, `sqlite3`
with `sqlite-vec`, `pytest`, `pip install -e .`. When it was time to start, the
machine where Brain will run had no Python installed — only the Microsoft Store
shortcut — but it had Node 24, which was already the everyday working runtime.

No design decision (ADRs 001 to 010) depends on the language. What does depend
on it is the list of libraries and a few installation details.

## Decision

Brain is written in **TypeScript**, runs on **Node.js 24** (pinned in
`.nvmrc`) and ships as an ESM module compiled by `tsc` into `dist/`.

| Role | Choice |
|---|---|
| CLI arguments | `node:util` `parseArgs` |
| HTTP to Ollama | native `fetch` |
| SQLite with FTS5 | `better-sqlite3` |
| Vectors | `sqlite-vec` (npm package), loaded with `db.loadExtension` |
| Tests | `vitest` |
| Type checking | `tsc --noEmit` |
| Local install | `npm install && npm run build && npm link` |

## Alternatives considered

**Python via uv, as in the specs.** Rejected. It would be faithful to the text,
but it would add a runtime to the machine just for this project, and the
problem of Python without `enable_load_extension` (ADR 004) would still exist in
some environments.

**`node:sqlite`, the SQLite built into Node.** Rejected for now. It avoids a
native dependency and supports extensions, but it is still marked experimental
and prints a warning at runtime. `better-sqlite3` is mature, has prebuilt
binaries for Windows, macOS and Linux, and includes FTS5. Worth revisiting when
`node:sqlite` stabilises.

**`commander` or `yargs` for the CLI.** Rejected. `parseArgs` covers what Brain
needs without an extra dependency; the command grouping in spec 10 is
hand-written help text.

## Consequences

- Supersedes the consequence in [ADR 004](004-single-sqlite-index.md) about
  Python's `enable_load_extension`. The equivalent is now `sqlite-vec` loading
  into `better-sqlite3`, and that is what `brain doctor` checks.
- The SPEC's dependency line becomes: Node 24, `better-sqlite3` (SQLite with
  FTS5), `sqlite-vec`, Ollama.
- The specs mention Python. Each one is corrected in the commit that implements
  it, as the specs README already anticipates; spec 01 was corrected together
  with this ADR.
- `HashEmbedder` remains what allows the suite to run without Ollama.
