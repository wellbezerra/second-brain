# ADR 014 — One pull request per feature, behind a feature flag

## Context

Every pull request runs `check-full` in CI, and every merge to `main` produces a
GitHub Release. Splitting a feature into many small pull requests multiplies
both: more CI minutes, and a release history full of half-features that no user
could use on their own. With one developer there is no review queue that small
pull requests would unblock.

A whole feature in one pull request has its own risk: a large change lands at
once and may change what the user sees before it is finished or trusted.

## Decision

Each feature ships as **one pull request**, linked to its spec. Inside the pull
request, commits stay small and follow Conventional Commits (the failing test
first, then the implementation).

A feature that changes user-visible behaviour ships **behind a feature flag**,
off by default, so the merge is safe and turning it on is a separate, deliberate
step. Flags are typed, read from the configuration file with an environment
override, and resolved once at startup.

Fixes, chores and docs follow the same rule: one branch, one pull request per
change.

## Consequences

- One release per feature, with release notes that read as features.
- CI cost scales with features, not with commits.
- Pull requests are larger; the review packet and the reviewer agent exist to
  keep them reviewable against the spec.
- Flags accumulate. A flag is removed in the pull request that makes its
  feature the default.

## Status

accepted · 2026-11-19
