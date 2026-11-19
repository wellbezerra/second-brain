# ADR 005 — Hybrid search fused by RRF

**Status:** accepted · 2026-11-19

## Context

Keyword search and vector similarity fail in opposite cases. FTS5 does not find
"why we used a queue" when the note says "asynchrony absorbs write spikes".
Vector search does not reliably find `RepoWriter` or `0x1F`, because proper
names and literals dissolve in semantic space.

I want a single list. For that I need to combine two rankings whose scores are
not comparable: FTS5's BM25 is a score with no upper bound, and vector distance
is on another scale.

## Decision

Each engine returns its own top-N. The two lists are fused by **reciprocal rank
fusion**:

```
score(d) = Σ  1 / (k + rank_i(d))        k = 60
         i∈engines
```

`rank` is the document's position in each list, starting at 1. Documents
present in both lists rise naturally.

## Alternatives considered

**Vector only.** Rejected. It loses proper names, acronyms and code, which is
half of what I look for in technical notes.

**FTS5 only.** Rejected. That is the search I already have in Obsidian; the
whole project is only justified by the other one.

**Normalise the scores and add them with weights.** Rejected. It would require
normalising BM25, which has no defined upper bound, against cosine distance.
Min-max normalisation within a result set is unstable: each engine's effective
weight changes with the score distribution of that particular query. RRF uses
only the order, which is precisely the part the two have in common.

**Reranking with a cross-encoder.** Rejected for now. It would improve ordering,
but it adds a second model and latency, and RRF already does most of the work.
Recorded as a possible evolution.

## Consequences

- No weight calibration between engines, and no tuning needed when I change the
  embedding model.
- The final score has no absolute meaning: it orders, it does not say "this
  result is 81% relevant". The CLI must not present it as a confidence
  percentage.
- `k = 60` is the value from the literature and serves as the default. It stays
  configurable so I can measure, not so I can keep tweaking it.
- A document that appears in only one list can still win, as long as it is at
  the top of that list. This is intended: it is what makes acronym search work.
- I need a set of reference queries to know whether a change to search made it
  better or worse. Without one, tuning the fusion is guesswork.
