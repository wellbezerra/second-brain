# ADR 013 — Two-level verification gate

## Context

Changes are verified by a coding agent as well as by the developer, many times
per task. The full suite will exercise real infrastructure: SQLite with the
`sqlite-vec` extension, the indexing pipeline end to end and the retrieval
evals over the fixture vault. That is slow on the development machine, which has
few cores. A single `make check` that runs everything would make every trivial
edit pay for the whole suite, and the agent's inner feedback loop would be
measured in minutes instead of seconds.

Running heavy suites side by side does not help either: on a low-core machine,
two parallel runs each take roughly twice as long, and both finish later than
if they had queued.

## Decision

Verification has two levels.

- **`make check-fast`** — lint and format check (Biome), type check (`tsc`) and
  unit tests only. No disk beyond the source tree, no network, no database.
  Target: seconds. It is the agent's inner loop and runs on every `git push`.
- **`make check-full`** — everything in `check-fast`, plus integration tests
  and the retrieval evals. It runs when a pull request opens (in CI, with the
  fake embedder) and before merge.

`check-full` takes a machine-wide lock, so two heavy runs never execute at the
same time. A waiting run prints its queue position. A lock whose owning
process is dead is discarded.

## Consequences

- The cheap gate can run constantly; the expensive one runs when a change is
  about to be shared.
- Tests must be sorted by layer. A unit test that touches disk, network or a
  database is in the wrong place and slows the inner loop for everyone.
- A defect that only integration tests can catch is found later — at PR time
  instead of at push time. Accepted: CI runs `check-full` on every PR.
- The lock adds a small script to maintain and a stale-lock rule to get right.

## Status

accepted · 2026-11-19
