# Roadmap — dez features, dez commits

Cada feature é uma spec e vira **um commit**. A ordem respeita as
dependências: nenhum commit depende de algo que ainda não existe, e cada um
deixa a suíte de testes verde.

## A sequência

| # | Commit | Spec | Depende de |
|---|---|---|---|
| 1 | `feat: esqueleto do projeto e configuração do vault` | [01](specs/01-esqueleto-e-configuracao.md) | — |
| 2 | `feat: leitura do vault e chunking de Markdown` | [02](specs/02-leitura-do-vault-e-chunking.md) | 1 |
| 3 | `feat: embeddings locais via Ollama` | [03](specs/03-embeddings-locais.md) | 1 |
| 4 | `feat: esquema do índice em SQLite com FTS5 e sqlite-vec` | [04](specs/04-esquema-do-indice.md) | 1 |
| 5 | `feat: indexação incremental do vault` | [05](specs/05-indexacao-incremental.md) | 2, 3, 4 |
| 6 | `feat: busca híbrida por palavra-chave e significado` | [06](specs/06-busca-hibrida.md) | 5 |
| 7 | `feat: criação de notas pela CLI` | [07](specs/07-criacao-de-notas.md) | 5 |
| 8 | `feat: reconciliação do índice` | [08](specs/08-reconciliacao.md) | 5 |
| 9 | `feat: histórico Git opcional do vault` | [09](specs/09-historico-git.md) | 7 |
| 10 | `feat: empacotamento, instalação e avaliação da busca` | [10](specs/10-empacotamento-e-avaliacao.md) | todas |

```
1 ─┬─ 2 ─┐
   ├─ 3 ─┼─ 5 ─┬─ 6 ───────┐
   └─ 4 ─┘     ├─ 7 ─ 9 ───┼─ 10
               └─ 8 ───────┘
```

Os commits 2, 3 e 4 são independentes entre si — dá para fazer em qualquer
ordem, ou em paralelo. Os commits 6, 7 e 8 também.

## Onde o projeto passa a servir para algo

O **commit 5** é o primeiro fim a fim: indexa um vault de verdade. Ainda não
busca, mas já dá para olhar o índice e confirmar que o chunking faz sentido.

O **commit 6** é o momento em que o projeto justifica a própria existência.
Daí em diante o uso diário já é possível, e os commits 7 a 10 reduzem atrito
e fecham arestas.

Se a vontade de usar falar mais alto que a de terminar, parar depois do 7 é
uma opção honesta: dá para capturar e buscar. O 8 e o 10 são o que torna o
projeto sustentável em vez de um protótipo que funcionou uma vez.

> **Runtime.** O projeto é Node/TypeScript ([ADR 011](adr/011-node-typescript-como-runtime.md)).
> As specs 02 a 10 ainda citam Python (`pytest`, `httpx`, `pip`); cada uma é
> corrigida no commit que a implementa.

## Regras para cada commit

- **Teste antes do código.** O teste que falha vai num commit próprio, antes
  da implementação. Isso vale sobretudo para o teste da segunda indexação
  (spec 05) e para o do `mtime` mentiroso (spec 08) — os dois descrevem
  comportamento que é fácil quebrar sem perceber.
- **Suíte verde ao fim de cada commit.** Nada de "conserto no próximo".
- **Nenhum teste exige Ollama.** `HashEmbedder` existe para isso desde a
  spec 03. Quebrar essa regra inviabiliza o CI.
- **Mudou a decisão, muda o ADR.** Não se edita um ADR aceito: escreve-se
  outro que o supera. A spec, essa sim, pode ser corrigida quando a
  implementação revelar que ela estava errada — e geralmente revela.
- **Nada abaixo da CLI imprime.** A fronteira da spec 01 é o que mantém a
  porta aberta para uma API ou um servidor MCP depois.

## O que fica para depois

Registrado aqui para não virar escopo escondido no meio do caminho:

- **Detecção de renomeação.** Hoje renomear é remoção mais inclusão, e
  reindexa à toa. Dá para resolver casando hashes órfãos ([ADR 006](adr/006-indexacao-incremental-por-hash.md)).
- **API HTTP local.** A estrutura já permite; falta o caso de uso.
- **Servidor MCP.** Fecharia o círculo com o projeto original, agora por
  escolha e não por herança.
- **Sync entre máquinas por Git.** Viável sem mudança de desenho.
- **Reranking com cross-encoder.** Só faz sentido depois que o `brain eval`
  mostrar onde a ordenação erra ([ADR 005](adr/005-busca-hibrida-com-rrf.md)).
- **Backlinks e grafo.** O Obsidian já faz; só valeria se a busca precisasse
  deles para ordenar.

## Decisões ainda em aberto

Nada aqui bloqueia o commit 1. São perguntas que a implementação vai responder
melhor que eu agora:

1. **1.200 caracteres é o alvo certo de trecho?** Chutado com base no que é
   comum. O `brain eval` da spec 10 é que vai dizer.
2. **`bge-m3` ou um modelo menor?** `bge-m3` é bom e multilíngue, mas pesado.
   Se a indexação inicial demorar demais nesta máquina, `nomic-embed-text` é
   a alternativa a medir.
3. **Peso do `heading` no BM25.** Começa em 2× o do `text`, por instinto.
   Também é caso de medir.
