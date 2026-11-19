# Brain — segundo cérebro local sobre um vault Obsidian

Visão geral do produto. As decisões estão em [`adr/`](adr/), o detalhamento de
cada feature em [`specs/`](specs/) e a ordem de construção em
[`ROADMAP.md`](ROADMAP.md).

## O problema

Notas pessoais acumulam valor com o tempo, mas só se você conseguir recuperá-las.
Dois modos de busca falham de formas opostas:

- **Palavra-chave** acha o que você lembra ter escrito. Falha quando você lembra
  da ideia, não dos termos.
- **Significado** acha o que você quis dizer. Falha em nomes próprios, siglas,
  trechos de código e qualquer coisa que dependa da grafia exata.

Quem escreve nota técnica precisa dos dois. Nenhuma das ferramentas que eu já
uso entrega os dois sobre os mesmos arquivos, sem mandar o conteúdo para fora da
máquina.

## O que o Brain é

Uma CLI que indexa um vault Obsidian e responde buscas híbridas sobre ele.

- As notas continuam sendo arquivos Markdown numa pasta. O Obsidian segue
  funcionando normalmente, sem plugin nenhum.
- O índice é um arquivo SQLite dentro do vault, derivado e descartável.
- Os embeddings são gerados localmente pelo Ollama. Nada sai da máquina.
- A busca combina FTS5 e similaridade vetorial e devolve uma lista única.

## O que o Brain não é

Delimitar isso importa porque o projeto nasceu como a réplica de um servidor MCP
remoto, e quase todo o peso daquele projeto vinha de requisitos que aqui não
existem.

| Não é | Porque |
|---|---|
| Um servidor MCP | A interface é CLI local ([ADR 001](adr/001-cli-local-em-vez-de-mcp.md)) |
| Um serviço remoto | Uso pessoal, uma máquina, sem acesso externo por ora |
| Um editor | O Obsidian já edita; o Brain indexa e busca |
| Um sistema multiusuário | Sem autenticação, sem OAuth, sem controle de acesso |
| Um sync de arquivos | Quem sincroniza é o Git ou o iCloud, se um dia for preciso |
| Um RAG com geração | Devolve trechos, não respostas. Quem gera texto é o assistente que consome a saída |

## Como se parece em uso

```console
$ brain index
12 notas novas, 3 alteradas, 1 removida — 184 trechos indexados em 6,2s

$ brain search "por que escolhemos fila em vez de chamada direta"
1. Arquitetura/indexacao.md  ·  Indexação > Decisões         (0.81)
   A fila absorve picos de escrita e deixa a indexação fora do
   caminho crítico da gravação...

2. Diario/2026-03-14.md  ·  Conversa com o time              (0.64)
   Discutimos chamar o indexador direto do writer. O problema é...

$ brain save "sqlite-vec aceita distance_metric=cosine na definição da coluna" --tag sqlite
Diario/2026-11-19.md
```

## Arquitetura

Tudo roda em processo, sem daemon e sem rede externa.

```
         ┌──────────────┐
         │  vault/*.md  │  ← fonte de verdade (Obsidian edita aqui)
         └──────┬───────┘
                │ leitura + hash
                ▼
         ┌──────────────┐        ┌──────────────┐
         │   indexador  │───────▶│    Ollama    │  embeddings locais
         └──────┬───────┘        └──────────────┘
                │ trechos + vetores
                ▼
   ┌────────────────────────────┐
   │  vault/.brain/index.db     │  índice derivado, descartável
   │  ├── files   (manifesto)   │
   │  ├── chunks  (trechos)     │
   │  ├── chunks_fts  (FTS5)    │
   │  └── chunks_vec  (vetores) │
   └────────────┬───────────────┘
                │
                ▼
         ┌──────────────┐
         │    busca     │  FTS5 + vetorial, fundidos por RRF
         └──────────────┘
```

O índice é sempre reconstruível a partir do vault. Essa é a propriedade que
permite tratar corrupção, troca de modelo e bug de indexação da mesma forma:
apagar e reindexar.

## Glossário

- **Vault** — a pasta de notas Markdown. O que o Obsidian chama de vault.
- **Nota** — um arquivo `.md` dentro do vault.
- **Trecho** (chunk) — pedaço de uma nota, unidade de busca e de embedding.
- **Manifesto** — tabela `files`, com o hash de cada nota já indexada. É o que
  permite saber o que mudou sem reler tudo.
- **Deriva** (drift) — divergência entre o vault e o índice. Alvo do `reconcile`.
- **RRF** — reciprocal rank fusion, como as duas listas de busca viram uma.

## Requisitos não-funcionais

| Dimensão | Alvo |
|---|---|
| Indexação incremental | Vault de 2.000 notas sem alterações reindexa em menos de 2s |
| Latência de busca | Menos de 300ms para um vault de 2.000 notas, embedding da query incluído |
| Consistência | Após `brain index`, as duas buscas refletem o disco. Não há indexação assíncrona |
| Custo | R$ 0 recorrente |
| Rede | Só localhost. O projeto deve funcionar com a máquina offline |
| Dependências | Node 24, better-sqlite3 (SQLite com FTS5), sqlite-vec, Ollama. Nada mais ([ADR 011](adr/011-node-typescript-como-runtime.md)) |

## Decisões registradas

| ADR | Decisão |
|---|---|
| [001](adr/001-cli-local-em-vez-de-mcp.md) | CLI local no lugar de servidor MCP |
| [002](adr/002-vault-como-fonte-de-verdade.md) | O vault em disco é a fonte de verdade |
| [003](adr/003-embeddings-locais-com-ollama.md) | Embeddings locais via Ollama |
| [004](adr/004-sqlite-unico-para-o-indice.md) | Um SQLite para manifesto, FTS5 e vetores |
| [005](adr/005-busca-hibrida-com-rrf.md) | Busca híbrida fundida por RRF |
| [006](adr/006-indexacao-incremental-por-hash.md) | Indexação incremental por hash |
| [007](adr/007-indice-dentro-do-vault.md) | O índice mora dentro do vault |
| [008](adr/008-chunking-guiado-por-headings.md) | Chunking guiado por headings |
| [009](adr/009-reconciliacao-sob-demanda.md) | Reconciliação sob demanda, sem daemon |
| [010](adr/010-git-opcional-e-explicito.md) | Git opcional e explícito |
| [011](adr/011-node-typescript-como-runtime.md) | Node.js e TypeScript como runtime |
