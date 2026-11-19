# Spec 01 — Project skeleton and configuration

**Commit:** `feat: project skeleton and vault configuration`
**Depends on:** nothing. It is the base.

## Goal

Have an installable Node/TypeScript package ([ADR 011](../adr/011-node-typescript-runtime.md)),
with the `brain` command registered, able to discover which vault to use and to
prepare that vault for the following features.

At the end of this commit nothing is indexed or searched. What exists is the
skeleton the other nine features plug into.

## Scope

**In:** package structure, `package.json` and `tsconfig.json`, configuration
module, `brain init` command, boundary between logic and interface.

**Out:** reading notes, database, embeddings, any other command.

## Boundary between logic and interface

This is the structural decision of the commit, and it is worth more than the
code it organises.

No module below `cli.ts` may call `parseArgs`, write to `stdout`
(`console.log`, `process.stdout`) or call `process.exit`. Logic receives
arguments and returns data; the CLI does the printing.

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
│   ├── cli.ts              # the only layer that knows parseArgs, stdout and process.exit
│   ├── config.ts
│   ├── init.ts             # brain init logic, returns data
│   └── version.ts
└── tests/
    ├── config.test.ts
    └── init.test.ts
```

## Configuration

Precedence, strongest to weakest:

1. CLI argument (`--vault`, `--model`)
2. environment variable (`BRAIN_VAULT`, `BRAIN_MODEL`, `BRAIN_OLLAMA_URL`)
3. the file `~/.config/brain/config.json` (honouring `XDG_CONFIG_HOME`)
4. built-in default

Fields and defaults:

| Field | Default | Note |
|---|---|---|
| `vault` | — | required; without it, an error pointing to `brain init` |
| `model` | `bge-m3` | embedding model in Ollama |
| `ollama_url` | `http://127.0.0.1:11434` | |
| `excludes` | `.obsidian`, `.trash`, `.git`, `.brain`, `node_modules` | ignored folders |
| `git` | `false` | automatic commit ([ADR 010](../adr/010-optional-explicit-git.md)) |

The vault path is expanded (`~`) and resolved to absolute at load time.
Everything below works with absolute paths; relative paths only exist at the
boundary with the user and inside the manifest.

## `brain init`

```
brain init --vault ~/Documents/notes [--model bge-m3] [--git]
```

Steps, in order:

1. Checks that the path exists and is a directory. If it does not exist, asks
   before creating it — creating a folder by mistake because of a mistyped path
   is worse than failing. Outside an interactive terminal there is nobody to
   ask: it fails, unless `--yes` is given.
2. Creates `<vault>/.brain/`.
3. If the vault is a Git repository, makes sure `.gitignore` contains the line
   `.brain/`. If it cannot write, warns and continues.
4. Writes the configuration to `~/.config/brain/config.json`.
5. Prints what was configured and what the next command is.

Running it again is safe: it updates the configuration and undoes nothing.

## Acceptance criteria

- `npm install && npm run build && npm link` puts the `brain` command on the
  PATH.
- `brain --version` prints the version.
- Any command without a configured vault fails with a message naming the three
  ways to fix it, and with a non-zero exit code.
- `brain init` on a non-existent path creates nothing without confirmation.
- After `brain init`, `<vault>/.brain/` exists and the configuration holds the
  absolute path.
- In a vault that is a Git repository, `.gitignore` contains `.brain/`.

## Tests

- Precedence: argument beats environment, which beats file, which beats default.
- `~` is expanded and the path becomes absolute.
- A missing config returns the defaults; a config with invalid JSON gives an
  error naming the file.
- A missing vault throws `ConfigError`, not some `TypeError`.
- `init` is idempotent: two runs leave the same state.
- `init` appends `.brain/` to a `.gitignore` that already has content, without
  duplicating the line if it is already there.
