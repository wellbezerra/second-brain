# Specs

One spec per feature, one feature per commit. Order and dependencies are in the
[ROADMAP](../ROADMAP.md); the product overview is in the [SPEC](../SPEC.md).

| # | Spec | Delivers |
|---|---|---|
| [01](01-skeleton-and-configuration.md) | Skeleton and configuration | installable package, `brain init` |
| [02](02-vault-reading-and-chunking.md) | Vault reading and chunking | walking the vault and splitting into chunks |
| [03](03-local-embeddings.md) | Local embeddings | Ollama client, `brain doctor` |
| [04](04-index-schema.md) | Index schema | SQLite with FTS5 and vectors, `brain status` |
| [05](05-incremental-indexing.md) | Incremental indexing | `brain index` |
| [06](06-hybrid-search.md) | Hybrid search | `brain search` |
| [07](07-note-creation.md) | Note creation | **withdrawn** ([ADR 012](../adr/012-read-only-vault.md)) |
| [08](08-reconciliation.md) | Reconciliation | `brain reconcile` |
| [09](09-git-history.md) | Optional Git history | **withdrawn** ([ADR 012](../adr/012-read-only-vault.md)) |
| [10](10-packaging-and-evaluation.md) | Packaging and evaluation | installation, `brain eval`, CI |

## Format

Each spec has: **goal**, **scope** (what is in and what is out), the feature's
**design**, **acceptance criteria** and **tests**, plus the commit and the
dependencies in the header.

The scope section is the one that prevents the most rework. Saying what is
*not* in a commit is what stops the feature from growing while it is being
written.

A spec is not a contract: when the implementation shows it was wrong, the spec
is corrected in the same commit that contradicts it. What is not rewritten is
an accepted [ADR](../adr/) — that one is superseded by a new one.
