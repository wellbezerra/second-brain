# AGENTS.md

**Brain** — CLI local que indexa um vault Obsidian e faz busca híbrida
(FTS5 + vetores via Ollama), tudo em SQLite dentro do vault. Nada sai da
máquina.

- Produto: [docs/SPEC.md](docs/SPEC.md)
- Decisões: [docs/adr/](docs/adr/)
- Uma spec por feature: [docs/specs/](docs/specs/)
- Ordem dos commits: [docs/ROADMAP.md](docs/ROADMAP.md)
- Visão geral: [ARCHITECTURE.md](ARCHITECTURE.md)

## Stack

Node 24 (`.nvmrc`), TypeScript estrito, ESM. `parseArgs` para a CLI, `fetch`
para o Ollama, `better-sqlite3` + `sqlite-vec` para o índice, Vitest para
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
- **Nenhum teste exige Ollama.** Use o `HashEmbedder` (spec 03).
- **Nada abaixo de `src/cli.ts` imprime, lê stdin ou chama `process.exit`.**
  A lógica devolve dados ou lança erros tipados.
- **ADR aceito não se edita**: escreve-se um novo que o supera. Spec pode ser
  corrigida no commit que a contradiz.
- Docs, mensagens da CLI e mensagens de commit em **português**.
- **Commits só com a conta Git do dono do repositório**: sem `Co-Authored-By`,
  sem rodapé de ferramenta. Push só quando pedido.
- Testes usam diretórios temporários e configuração injetada
  (`env`, `XDG_CONFIG_HOME`); nunca tocam a configuração real do usuário.
