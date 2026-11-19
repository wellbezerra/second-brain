# ADR 011 — Node.js e TypeScript como runtime

**Status:** aceita · 2026-11-19

## Contexto

As specs foram escritas pensando em Python: `argparse`, `httpx`, `sqlite3`
com `sqlite-vec`, `pytest`, `pip install -e .`. Na hora de começar, a máquina
onde o Brain vai rodar não tinha Python instalado — só o atalho da Microsoft
Store —, mas tinha Node 24, que já era o runtime de trabalho do dia a dia.

Nenhuma decisão de desenho (ADRs 001 a 010) depende da linguagem. O que
depende é a lista de bibliotecas e alguns detalhes de instalação.

## Decisão

O Brain é escrito em **TypeScript**, roda em **Node.js 24** (fixado no
`.nvmrc`) e é publicado como módulo ESM compilado por `tsc` para `dist/`.

| Papel | Escolha |
|---|---|
| Argumentos da CLI | `node:util` `parseArgs` |
| HTTP para o Ollama | `fetch` nativo |
| SQLite com FTS5 | `better-sqlite3` |
| Vetores | `sqlite-vec` (pacote npm), carregado com `db.loadExtension` |
| Testes | `vitest` |
| Checagem de tipos | `tsc --noEmit` |
| Instalação local | `npm install && npm run build && npm link` |

## Alternativas consideradas

**Python via uv, como nas specs.** Rejeitada. Seria fiel ao texto, mas
acrescentaria um runtime à máquina só para este projeto, e o problema do
Python sem `enable_load_extension` (ADR 004) continuaria existindo em alguns
ambientes.

**`node:sqlite`, o SQLite embutido no Node.** Rejeitada por ora. Evita
dependência nativa e suporta extensões, mas ainda é marcado como experimental
e emite aviso em tempo de execução. `better-sqlite3` é maduro, tem binários
prontos para Windows, macOS e Linux, e inclui FTS5. Vale reavaliar quando o
`node:sqlite` estabilizar.

**`commander` ou `yargs` para a CLI.** Rejeitadas. `parseArgs` cobre o que o
Brain precisa sem dependência a mais; o agrupamento de comandos da spec 10 é
texto de ajuda escrito à mão.

## Consequências

- Supera a consequência do [ADR 004](004-sqlite-unico-para-o-indice.md) sobre
  `enable_load_extension` do Python. O equivalente agora é o `sqlite-vec`
  carregar no `better-sqlite3`, e é isso que o `brain doctor` verifica.
- A linha de dependências da SPEC passa a ser: Node 24, `better-sqlite3`
  (SQLite com FTS5), `sqlite-vec`, Ollama.
- As specs citam Python. Cada uma é corrigida no commit que a implementa,
  como o README das specs já prevê; a spec 01 foi corrigida junto com este ADR.
- `HashEmbedder` continua sendo o que permite rodar a suíte sem Ollama.
