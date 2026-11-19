---
description: Write the review packet (spec + branch diff) for an independent review
argument-hint: "[docs/specs/NN-name.md]"
allowed-tools: Bash(node --disable-warning=ExperimentalWarning scripts/review-packet.ts:*)
---

Run exactly this, and do not read or summarise the packet it writes:

```sh
node --disable-warning=ExperimentalWarning scripts/review-packet.ts "$ARGUMENTS"
```

If it fails, report its message and stop. If it succeeds, it prints the packet
path. Tell the user to review it in a fresh session, not this one:

```sh
claude --agent reviewer "Review <printed path>"
```

and to bring any blockers back here.
