# Spec 10 — Packaging, installation and search evaluation

**Commit:** `feat: packaging, installation and search evaluation`
**Depends on:** all of the previous ones.

## Goal

Wrap the project into something installable on a new machine, and create the
way to measure whether a change to search improved or worsened the results.

The second part matters more in the long run. Without measurement, tuning
chunking, the model or a fusion parameter is opinion.

## Scope

**In:** installation, README, CLI consistency, a reference query set,
`brain eval`, CI.

**Out:** publishing to PyPI, packaging for Homebrew.

## Installation

```sh
git clone <repo> && cd brain
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
brain doctor
brain init --vault ~/Documents/notes
brain index
```

The README has to cover the three non-Python prerequisites, because that is
where installation usually fails:

- **Ollama** installed, running, with the model pulled (`ollama pull bge-m3`).
- **SQLite with FTS5.** Present by default, but not in every build.
- **Extension loading enabled in Python.** The macOS system Python often lacks
  it, and `sqlite-vec` does not load. The way out is a Homebrew or pyenv Python.
  `brain doctor` detects it and the README explains it.

## CLI consistency

Until now each feature added its own command. This commit combs through them:

- every structured output accepts `--json`, with the same envelope format;
- every long-running command accepts `--quiet`;
- exit codes: `0` success, `1` divergence or nothing found, `2` usage error, `3`
  missing external dependency;
- error messages say what to do, not just what failed;
- `brain --help` lists the commands grouped by purpose, not alphabetically.

## Search evaluation

A file `eval/queries.yaml` with real queries and the expected results:

```yaml
- query: "why we do not use a queue"
  expect:
    - docs/adr/009-on-demand-reconciliation.md
  do_not_expect:
    - Journal/2026-01-02.md

- query: "sqlite-vec cosine"
  expect:
    - docs/adr/003-local-embeddings-with-ollama.md
    - docs/adr/004-single-sqlite-index.md
```

`brain eval` runs the queries against a reference vault and reports
**recall@5** and **MRR**, per query and in aggregate. With `--compare`, it shows
the difference against a previously saved run.

The set starts small — twenty queries are enough to catch gross regressions —
and grows every time I notice a search that should have worked and did not.
That is the discipline that keeps the set useful: every frustration with search
becomes a line in the file.

This is what unlocks future work. With this measure I can compare chunk size,
embedding model, RRF `k` and the `heading` weight in BM25 with numbers instead
of impressions. Without it, every adjustment is a guess.

## CI

GitHub Actions running `pytest` and type checking on each push.

The whole suite runs with `HashEmbedder` and does not require Ollama — which has
been a requirement since [spec 03](03-local-embeddings.md), and is what makes CI
possible. `brain eval` needs a real model, so it runs by hand, not in CI.

## Acceptance criteria

- A from-scratch installation in a clean environment follows the README with no
  implicit step.
- `brain doctor` correctly detects a missing Ollama, a missing model and a
  Python without extension loading.
- `brain --help` is readable and grouped.
- Every command honours the exit code table.
- `brain eval` runs and reports recall@5 and MRR.
- CI passes on a runner without Ollama.

## Tests

- A smoke test that walks the whole flow in a temporary vault: `init`, `index`,
  `search`, `reconcile`, `status` — and asserts the vault is byte-identical at
  the end.
- A test that every registered command accepts `--json` and `--quiet`.
- `brain eval` with a tiny reference vault and trivial queries, just to make sure
  the metric computation is right — real quality evaluation is manual, with a
  real model.
