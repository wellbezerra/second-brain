# Brain

Segundo cérebro local: indexa um vault Obsidian e responde buscas híbridas
(palavra-chave + significado) sobre ele. As notas e o índice ficam na sua
máquina; os embeddings vêm de uma API à sua escolha.

> Em construção. Hoje existem `brain init` e `brain doctor`; o resto chega
> commit a commit, na ordem do [roadmap](docs/ROADMAP.md).

## Pré-requisitos

- **Node.js 24** (veja `.nvmrc`).
- **Uma chave de API de embeddings**, em variável de ambiente:

  | Provedor | `--provider` | Variável | Modelo padrão |
  |---|---|---|---|
  | OpenAI | `openai` (padrão) | `OPENAI_API_KEY` | `text-embedding-3-small` |
  | Google Gemini | `gemini` | `GEMINI_API_KEY` | `gemini-embedding-2` |
  | Voyage AI | `voyage` | `VOYAGE_API_KEY` | `voyage-4` |
  | Ollama (local) | `ollama` | — | `bge-m3` |

  O Claude não tem modelo de embedding; a Anthropic indica a Voyage AI.
  A chave **nunca** vai para o arquivo de configuração.

O `brain doctor` verifica tudo isso e diz o que falta.

> **Privacidade:** com um provedor de API, o texto dos trechos das notas (na
> indexação) e as consultas (na busca) são enviados a ele. Só o Ollama mantém
> tudo na máquina. Veja o [ADR 012](docs/adr/012-embeddings-por-api-com-provedor-configuravel.md).

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
export OPENAI_API_KEY=sk-...        # ou GEMINI_API_KEY / VOYAGE_API_KEY
brain init --vault ~/Documentos/notas [--provider openai] [--model ...] [--git] [--yes]
brain doctor
```

O `init` cria `<vault>/.brain/`, acrescenta `.brain/` ao `.gitignore` se o
vault for um repositório Git, e grava a configuração em
`~/.config/brain/config.json` (ou em `$XDG_CONFIG_HOME/brain/`). Se a pasta
não existir, ele pergunta antes de criar.

A configuração pode ser sobreposta por variável de ambiente (`BRAIN_VAULT`,
`BRAIN_PROVIDER`, `BRAIN_MODEL`, `BRAIN_OLLAMA_URL`) ou por argumento
(`--vault`, `--provider`, `--model`), nessa ordem crescente de prioridade.

## Desenvolvimento

```sh
npm test            # vitest; nenhum teste usa rede
npm run typecheck   # tsc --noEmit
```

Documentação: [SPEC](docs/SPEC.md), [ADRs](docs/adr/), [specs](docs/specs/),
[arquitetura](ARCHITECTURE.md). Regras de trabalho em [AGENTS.md](AGENTS.md).
