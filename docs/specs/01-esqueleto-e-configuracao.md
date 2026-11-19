# Spec 01 — Esqueleto do projeto e configuração

**Commit:** `feat: esqueleto do projeto e configuração do vault`
**Depende de:** nada. É a base.

## Objetivo

Ter um pacote Node/TypeScript instalável ([ADR 011](../adr/011-node-typescript-como-runtime.md)), com o comando `brain` registrado, capaz de
descobrir qual vault usar e de preparar esse vault para as features seguintes.

Ao fim deste commit nada é indexado nem buscado. O que existe é o esqueleto no
qual as outras nove features se encaixam.

## Escopo

**Entra:** estrutura do pacote, `package.json` e `tsconfig.json`, módulo de configuração,
comando `brain init`, fronteira entre lógica e interface.

**Fica de fora:** leitura de notas, banco, embeddings, qualquer outro comando.

## Fronteira entre lógica e interface

Esta é a decisão estrutural do commit, e vale mais que o código que ela
organiza.

Nenhum módulo abaixo de `cli.ts` pode chamar `parseArgs`, escrever em `stdout`
(`console.log`, `process.stdout`) ou chamar `process.exit`. A lógica recebe argumentos e devolve dados; quem imprime
é a CLI.

O motivo é o descrito na [ADR 001](../adr/001-cli-local-em-vez-de-mcp.md): se um
dia eu quiser uma API HTTP ou um servidor MCP por cima disto, quero escrever
uma casca fina, não desemaranhar `print` de regra de negócio. O teste prático é
direto — se um módulo de lógica precisa ser testado capturando saída padrão, a
fronteira foi violada.

## Estrutura

```
brain/
├── package.json            # bin "brain" → dist/cli.js
├── tsconfig.json
├── README.md
├── docs/                   # SPEC, ADRs, specs
├── src/
│   ├── cli.ts              # única camada que conhece parseArgs, stdout e process.exit
│   ├── config.ts
│   ├── init.ts             # lógica do brain init, devolve dados
│   └── version.ts
└── tests/
    ├── config.test.ts
    └── init.test.ts
```

## Configuração

Precedência, do mais forte para o mais fraco:

1. argumento da CLI (`--vault`, `--model`)
2. variável de ambiente (`BRAIN_VAULT`, `BRAIN_MODEL`, `BRAIN_OLLAMA_URL`)
3. arquivo `~/.config/brain/config.json` (respeitando `XDG_CONFIG_HOME`)
4. padrão embutido

Campos e padrões:

| Campo | Padrão | Observação |
|---|---|---|
| `vault` | — | obrigatório; sem ele, erro orientando o `brain init` |
| `model` | `bge-m3` | modelo de embedding no Ollama |
| `ollama_url` | `http://127.0.0.1:11434` | |
| `excludes` | `.obsidian`, `.trash`, `.git`, `.brain`, `node_modules` | pastas ignoradas |
| `git` | `false` | commit automático ([ADR 010](../adr/010-git-opcional-e-explicito.md)) |

O caminho do vault é expandido (`~`) e resolvido para absoluto na carga. Tudo
abaixo trabalha com caminho absoluto; caminho relativo só existe na fronteira
com o usuário e dentro do manifesto.

## `brain init`

```
brain init --vault ~/Documentos/notas [--model bge-m3] [--git]
```

Passos, em ordem:

1. Verifica que o caminho existe e é um diretório. Se não existe, pergunta
   antes de criar — criar uma pasta por engano, por causa de um caminho
   digitado errado, é pior que falhar. Fora de um terminal interativo não há
   a quem perguntar: falha, a menos que venha `--yes`.
2. Cria `<vault>/.brain/`.
3. Se o vault é um repositório Git, garante a linha `.brain/` no `.gitignore`.
   Se não conseguir escrever, avisa e segue.
4. Grava a configuração em `~/.config/brain/config.json`.
5. Imprime o que foi configurado e qual é o próximo comando.

Rodar de novo é seguro: atualiza a configuração e não desfaz nada.

## Critérios de aceite

- `npm install && npm run build && npm link` registra o comando `brain` no PATH.
- `brain --version` imprime a versão.
- Qualquer comando sem vault configurado falha com mensagem que nomeia as três
  formas de resolver, e com código de saída diferente de zero.
- `brain init` num caminho inexistente não cria nada sem confirmação.
- Depois de `brain init`, `<vault>/.brain/` existe e a configuração tem o
  caminho absoluto.
- Num vault que é repositório Git, `.gitignore` contém `.brain/`.

## Testes

- Precedência: argumento vence ambiente, que vence arquivo, que vence padrão.
- `~` é expandido e o caminho vira absoluto.
- Config ausente devolve os padrões; config com JSON inválido dá erro que
  nomeia o arquivo.
- Vault ausente lança `ConfigError`, não um `TypeError` qualquer.
- `init` é idempotente: duas execuções deixam o mesmo estado.
- `init` acrescenta `.brain/` a um `.gitignore` que já tem conteúdo, sem
  duplicar a linha se ela já estiver lá.
