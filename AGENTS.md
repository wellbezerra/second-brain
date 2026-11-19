# AGENTS.md

**Brain** — CLI local que indexa um vault Obsidian e faz busca híbrida
(FTS5 + vetores), tudo em SQLite dentro do vault. Os embeddings vêm de uma
API configurável — OpenAI, Gemini, Voyage — ou do Ollama local (ADR 012).

- Produto: [docs/SPEC.md](docs/SPEC.md)
- Decisões: [docs/adr/](docs/adr/)
- Uma spec por feature: [docs/specs/](docs/specs/)
- Ordem dos commits: [docs/ROADMAP.md](docs/ROADMAP.md)
- Visão geral: [ARCHITECTURE.md](ARCHITECTURE.md)

## Stack

Node 24 (`.nvmrc`), TypeScript estrito, ESM. `parseArgs` para a CLI, `fetch`
para os provedores de embedding, `better-sqlite3` + `sqlite-vec` para o índice, Vitest para
testes ([ADR 011](docs/adr/011-node-typescript-como-runtime.md)).

## Comandos

```sh
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run build       # compila para dist/
npm link            # registra `brain` no PATH
```

## Regras

- **Uma feature, uma spec, um commit**, na ordem do ROADMAP. Antes do commit
  da feature vem um commit com o teste que falha.
- **Suíte verde ao fim de cada commit de feature.**
- **Nenhum teste usa rede.** Use o `HashEmbedder` (spec 03); clientes de
  API recebem `fetch` injetado.
- **Chave de API só por variável de ambiente**, nunca em arquivo de
  configuração, log ou mensagem de erro.
- **Nada abaixo de `src/cli.ts` imprime, lê stdin ou chama `process.exit`.**
  A lógica devolve dados ou lança erros tipados.
- **ADR aceito não se edita**: escreve-se um novo que o supera. Spec pode ser
  corrigida no commit que a contradiz.
- Docs e mensagens da CLI em **português**. Commits, títulos e descrições de
  PR, issues e comentários de código em **inglês**
  ([.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)); o PR é reprovado se
  aparecer acento ou palavra comum do português.
- **Conventional Commits** em commits e títulos de PR:
  `type(scope): short description`, com `!` para mudança incompatível.
- **Uma branch por mudança, criada a partir de `main`**, com o nome
  `<type>/<kebab-case-description>` (`feat/`, `fix/`, `docs/`, `ci/`...).
  Nunca commit direto em `main`; tudo entra por PR, que precisa de label,
  Project e assignee. Cada merge em `main` gera uma release semver.
- **Commits só com a conta Git do dono do repositório**: sem `Co-Authored-By`,
  sem rodapé de ferramenta. Push só quando pedido.
- Testes usam diretórios temporários e configuração injetada
  (`env`, `XDG_CONFIG_HOME`); nunca tocam a configuração real do usuário.
