---
title: Hybrid search
tags: [brain, search, rrf]
---

# Hybrid search

Keyword search (BM25 over FTS5) finds exact names like `RepoWriter` or `0x1F`.
Vector search finds paraphrases. Neither is enough alone.

## Reciprocal rank fusion

RRF combines the two lists using only the rank of each result:
score = sum of 1 / (k + rank), with k = 60. A chunk at the top of one list can
still win even if the other engine never saw it, which is what makes acronym
search work.

## Why not weighted scores

BM25 has no upper bound and cosine distance lives on another scale. Min-max
normalisation changes each engine's weight from query to query. Ranks are the
only part the two engines have in common.

## Open questions

- Is a heading weight of 2x right for BM25?
- Would a cross-encoder reranker be worth its latency? Measure with the evals
  first. Related: [[architecture]].
