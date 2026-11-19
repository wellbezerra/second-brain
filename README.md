# Brain

Segundo cérebro local: indexa um vault Obsidian e responde buscas híbridas
(palavra-chave + significado) sobre ele, sem mandar nada para fora da máquina.

> Em construção. Hoje existe o esqueleto e o `brain init`; o resto chega
> commit a commit, na ordem do [roadmap](docs/ROADMAP.md).

## Pré-requisitos

- **Node.js 24** (veja `.nvmrc`).
- **Ollama**, a partir da indexação (spec 03 em diante).

## Instalação

```sh
git clone <repo> && cd second-brain
npm install
npm run build
npm link            # registra o comando `brain`
brain --version
```

## Uso

```sh
brain init --vault ~/Documentos/notas [--model bge-m3] [--git] [--yes]
```

O `init` cria `<vault>/.brain/`, acrescenta `.brain/` ao `.gitignore` se o
vault for um repositório Git, e grava a configuração em
`~/.config/brain/config.json` (ou em `$XDG_CONFIG_HOME/brain/`). Se a pasta
não existir, ele pergunta antes de criar.

A configuração pode ser sobreposta por variável de ambiente (`BRAIN_VAULT`,
`BRAIN_MODEL`, `BRAIN_OLLAMA_URL`) ou por argumento (`--vault`, `--model`),
nessa ordem crescente de prioridade.

## Desenvolvimento

```sh
npm test            # vitest
npm run typecheck   # tsc --noEmit
```

Documentação: [SPEC](docs/SPEC.md), [ADRs](docs/adr/), [specs](docs/specs/),
[arquitetura](ARCHITECTURE.md). Regras de trabalho em [AGENTS.md](AGENTS.md).
