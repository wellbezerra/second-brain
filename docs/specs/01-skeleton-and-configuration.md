# Spec 01 — Project skeleton and configuration

**Commit:** `feat: project skeleton and vault configuration`
**Depends on:** nothing. It is the base.

## Goal

Have an installable Node/TypeScript package ([ADR 011](../adr/011-node-typescript-runtime.md)),
with the `brain` command registered, able to discover which vault to use and
where its index lives. The vault itself is never written to
([ADR 012](../adr/012-read-only-vault.md)).

At the end of this commit nothing is indexed or searched. What exists is the
skeleton the other nine features plug into.

## Scope

**In:** package structure, `package.json` and `tsconfig.json`, configuration
module, `brain init` command, boundary between logic and interface.

**Out:** reading notes, database, embeddings, any other command.

## Boundary between logic and interface

This is the structural decision of the commit, and it is worth more than the
code it organises.

No module below the CLI layer (`cli.ts`, plus the pure argument parser in
`commands.ts`) may parse `argv`, write to `stdout` (`console.log`,
`process.stdout`) or call `process.exit`. Logic receives arguments and returns
data or throws typed errors; the CLI prints and picks the exit code (1 for a
failed command, 2 for a usage error).

The reason is the one in [ADR 001](../adr/001-local-cli-instead-of-mcp.md): if
one day I want an HTTP API or an MCP server on top of this, I want to write a
thin shell, not untangle `print` from business rules. The practical test is
simple — if a logic module has to be tested by capturing standard output, the
boundary has been violated.

## Structure

```
brain/
├── package.json            # bin "brain" → dist/cli.js
├── tsconfig.json
├── README.md
├── docs/                   # SPEC, ADRs, specs
├── src/
│   ├── cli.ts              # the only layer that knows stdout and process.exit
│   ├── commands.ts         # argv → command, pure
│   ├── config.ts           # precedence, validation, derived locations; pure
│   ├── config-file.ts      # reads the configuration file
│   ├── flags.ts            # feature flags
│   ├── init.ts             # brain init logic, returns data
│   └── version.ts
└── tests/
    ├── unit/               # config, flags, commands
    └── integration/        # init on real folders; the built CLI end to end
```

## Configuration

Precedence, strongest to weakest:

1. CLI argument (`--vault`, `--model`)
2. environment variable (`SECOND_BRAIN_VAULT`, `SECOND_BRAIN_MODEL`,
   `SECOND_BRAIN_OLLAMA_URL`)
3. the file `~/.config/brain/config.json` (honouring `XDG_CONFIG_HOME`)
4. built-in default

Fields and defaults:

| Field | Default | Note |
|---|---|---|
| `vault` | — | required; without it, an error pointing to `brain init` |
| `model` | `bge-m3` | embedding model in Ollama |
| `ollama_url` | `http://127.0.0.1:11434` | |
| `excludes` | `.obsidian`, `.trash`, `.git`, `node_modules` | ignored folders |

The file uses the field names above (`ollama_url`, not `ollamaUrl`). Invalid
JSON, a top level that is not an object, or a field of the wrong type is a
`ConfigError` naming the file. A broken file fails only the commands that need
the configuration: `brain --version` and `brain --help` keep working.

The vault path is expanded (`~`) and resolved to absolute at load time.
Everything below works with absolute paths; relative paths only exist at the
boundary with the user and inside the manifest.

The index directory is derived, not configured: `<data-dir>/brain/<vault-id>/`,
where `<data-dir>` is, in order: `$XDG_DATA_HOME` if set (any platform); on
Windows `%LOCALAPPDATA%`, else `<home>\AppData\Local`; elsewhere
`~/.local/share`. And `<vault-id>` is the first 16 hex characters of
the `sha256` of the vault's resolved real path
([ADR 012](../adr/012-read-only-vault.md)).

## `brain init`

```
brain init --vault ~/Documents/notes [--model bge-m3]
```

Steps, in order:

1. Checks that the path exists and is a directory. If it does not, fails — Brain
   never creates or modifies anything inside or at the vault path.
2. Reads the current configuration. If it is broken or cannot be read, fails
   naming the file, before creating or overwriting anything. Fails too, before
   writing anything, when the index folder or the configuration file would land
   inside the vault (for example `brain init --vault ~`).
3. Creates the index directory and writes `vault.json` into it, recording the
   vault's real path (links and Windows short names resolved).
4. Writes the configuration file with the same real path in `vault` (and
   `model`, when given), keeping every other key already in it.
5. Prints what was configured, where the index lives and what the next command
   is.

Running it again is safe: it updates the configuration and undoes nothing.

`brain init` is user-visible, so it ships behind the `init` feature flag, off by
default ([ADR 014](../adr/014-one-pr-per-feature-behind-a-flag.md)). A
`features` list in the configuration file turns flags on, and
`SECOND_BRAIN_FEATURES` (comma-separated; `name` on, `-name` off) overrides it.
With the flag off, `brain init` exits 2 and says how to turn it on.

## Acceptance criteria

- `npm install && npm run build && npm link` puts the `brain` command on the
  PATH.
- `brain --version` prints the version.
- Any command without a configured vault fails with a message naming the three
  ways to fix it, and with a non-zero exit code. No command in this spec needs
  a vault yet: the message is proved on the configuration logic, and through
  the CLI with the first command that uses it (spec 05).
- `brain init` on a non-existent path fails and creates nothing.
- After `brain init`, the index directory exists with a `vault.json`, and the
  configuration holds the absolute vault path.
- `brain init` leaves the vault byte-identical: no file or folder is created,
  changed or removed in it.

## Tests

- Precedence: argument beats environment, which beats file, which beats default.
- `~` is expanded and the path becomes absolute.
- A missing config returns the defaults; a config with invalid JSON gives an
  error naming the file.
- A missing vault throws `ConfigError`, not some `TypeError`.
- `init` is idempotent: two runs leave the same state.
- The same vault reached through two spellings of its path (trailing slash,
  symlink) maps to the same `<vault-id>`.
- A snapshot of the vault taken before `init` equals one taken after.
