# Spec 03 — Local embeddings

**Commit:** `feat: local embeddings via Ollama`
**Depends on:** [01](01-skeleton-and-configuration.md)
**Reference decision:** [ADR 003](../adr/003-local-embeddings-with-ollama.md)

## Goal

Turn a list of texts into a list of vectors by talking to Ollama on localhost.
Alongside it, a fake embedder that allows testing the rest of the project
without Ollama installed.

## Scope

**In:** the `Embedder` protocol, the Ollama client, a deterministic embedder for
tests, diagnostics (`brain doctor`).

**Out:** persisting vectors (spec 04), deciding what to embed (spec 05).

## The protocol

```python
class Embedder(Protocol):
    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...
    def health(self) -> str: ...   # "" when everything is fine
    @property
    def dim(self) -> int: ...
```

The rest of the project depends on this protocol, never on Ollama directly.
That is what allows swapping in an external API later without touching the
indexer, and what makes the tests independent of the network.

## `OllamaEmbedder`

Talks to `POST /api/embed`, in batches of 32 texts. Older installations only
have `/api/embeddings`, one text per call — a 404 on the first endpoint falls
back to the second automatically.

**Normalisation.** Every vector comes out with unit length. Euclidean distance
then orders the same as cosine, and I do not depend on the vector extension
accepting `distance_metric=cosine`. A zero-length vector passes through
unchanged instead of dividing by zero.

**Dimension.** Not configured. It is discovered on the first embedding and
remembered by the instance.

**Timeout.** 5s to connect, 120s to respond. The first call after
`ollama serve` loads the model into memory and is slow.

## `FakeEmbedder`

A deterministic embedder with no network, for tests: it projects each token onto
a dimension by hashing and normalises. It does not understand semantics, but it
is consistent and texts sharing words end up close — enough to exercise
indexing, search and fusion.

It needs a low dimension (256) and a hash that is stable between runs, which in
Python means not using `str`'s `hash()` with a random `PYTHONHASHSEED`; use
`hashlib` and derive the index from it.

## Errors

The most likely failure mode is operational, not code. Each one has its own
message:

| Situation | Message |
|---|---|
| Ollama does not respond | `could not reach Ollama at <url>. Is it running? (ollama serve)` |
| Model not pulled | `the model '<m>' is not pulled. Run: ollama pull <m>` |
| Response with the wrong count | `Ollama returned N vectors for M texts` |
| Timeout | `Ollama did not respond within 120s. Is the model too large for this machine?` |

## `brain doctor`

A diagnostic command that checks, in order, and prints a `✓` or `✗` per item:
Python and its version; SQLite with FTS5; SQLite with extension loading enabled;
`sqlite-vec` importable; Ollama responding; configured model available;
dimension the model produces; vault configured and present.

It exists because all of these are external prerequisites, and finding out which
one failed in the middle of indexing 2,000 notes is worse than having a command
that answers it in two seconds.

## Acceptance criteria

- `embed([])` returns `[]` without calling the network.
- A batch larger than 32 is split and returned in input order.
- Every returned vector has unit length (tolerance 1e-6).
- A 404 on `/api/embed` falls back to `/api/embeddings` and returns the same
  shape.
- Ollama being down produces the guiding message, not an `httpx` traceback.
- `FakeEmbedder` returns the same vector for the same text across processes.
- `brain doctor` runs and reports without Ollama, marking only that item as
  failed.

## Tests

A fake HTTP client (`httpx.MockTransport`) covering: a simple batch, a split
batch, the 404 fallback, a connection error, a response with the wrong count,
an empty response. No test in the suite may require Ollama running.
