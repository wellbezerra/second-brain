# ADR 001 — Local CLI instead of an MCP server

**Status:** accepted · 2026-11-19

## Context

The reference project is a remote MCP server, running as a Cloudflare Worker,
that serves the same notes to Claude Code, Claude on the web, Claude on mobile
and ChatGPT. Almost all of that project's complexity — the Worker, OAuth, a
Durable Object to serialise writes, an indexing queue, a reconciliation
workflow — exists to solve **several remote clients writing to the same
collection at the same time**.

My case is different: one machine, one user, one vault. Concurrent clients and
remote access are not in the requirements.

## Decision

The interface is a local CLI, `brain`, run on the same computer that holds the
vault.

No server, no open port, no authentication. Each command opens the index, does
its work and closes it.

## Alternatives considered

**Keep MCP.** Rejected. It would pay all the concurrency and authentication
complexity to solve a problem I do not have. It would also require a running
server for search to work.

**Obsidian plugin.** Rejected for now. It would tie search to an open editor,
and I want to call search from scripts and from the terminal. Plugin
development is also slower to iterate on than a CLI.

**REST API on localhost.** Rejected for now, but it is the natural next step if
I need to plug in other tools. The logic lives in modules that know nothing
about the CLI precisely so that an API — or an MCP server — can later be a thin
shell on top.

## Consequences

- No concurrency: one process at a time, writing straight to SQLite. The need
  for a Durable Object, a queue and write serialisation disappears.
- No authentication: access control is the file system's.
- Search does not exist outside the machine. Accepted for now.
- The exit stays open: if I want MCP or HTTP later, it is a new layer over the
  same modules, not a rewrite. This is a structural requirement, not just a
  hope — the boundary between logic and interface is specified in
  [spec 01](../specs/01-skeleton-and-configuration.md).
