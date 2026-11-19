# Spec 04 — Esquema do índice

**Commit:** `feat: esquema do índice em SQLite com FTS5 e sqlite-vec`
**Depende de:** [01](01-esqueleto-e-configuracao.md)
**Decisão de referência:** [ADR 004](../adr/004-sqlite-unico-para-o-indice.md),
[ADR 007](../adr/007-indice-dentro-do-vault.md),
[ADR 012](../adr/012-embeddings-por-api-com-provedor-configuravel.md)

## Objetivo

Criar o arquivo de índice e a camada de acesso a ele. Abrir, migrar, inserir,
apagar e contar — sem nenhuma regra de indexação, que fica na spec 05.

## Escopo

**Entra:** schema, conexão, migração, operações de escrita, `brain status`.

**Fica de fora:** decidir o que indexar (05), buscar (06).

## Conexão

O arquivo fica em `<vault>/.brain/index.db`. Ao abrir:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
```

O SQLite vem do `better-sqlite3` (binário pronto, com FTS5) e a extensão do
pacote `sqlite-vec`, carregada logo após abrir. O `better-sqlite3` só carrega
extensões pela API em C: `load_extension()` em SQL nunca fica ligado, então não
há o que desabilitar depois. Se a extensão não carregar, o erro diz isso e
aponta o `brain doctor`, que ganha os itens `sqlite` (versão e FTS5) e
`sqlite-vec`.

O `better-sqlite3` é instalado sem rodar o script de compilação
(`allowScripts` no `package.json`): os binários prontos cobrem Windows, macOS
e Linux, e compilar exigiria toolchain de C++.

## Tabelas

```sql
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- chaves: schema_version, provider, model, dim, last_index_at

CREATE TABLE files (
    id         INTEGER PRIMARY KEY,
    path       TEXT    NOT NULL UNIQUE,   -- relativo à raiz do vault
    hash       TEXT    NOT NULL,          -- sha256 do conteúdo
    mtime      REAL    NOT NULL,          -- milissegundos, como stat.mtimeMs
    size       INTEGER NOT NULL,
    title      TEXT,
    indexed_at REAL    NOT NULL           -- milissegundos
);

CREATE TABLE chunks (
    id      INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    ord     INTEGER NOT NULL,
    heading TEXT,
    text    TEXT    NOT NULL,
    UNIQUE (file_id, ord)
);

CREATE INDEX chunks_by_file ON chunks(file_id);

CREATE VIRTUAL TABLE chunks_fts USING fts5(
    text,
    heading,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE chunks_vec USING vec0(
    chunk_id  INTEGER PRIMARY KEY,
    embedding float[<dim>]
);
```

## O invariante central

**`chunks.id` = `chunks_fts.rowid` = `chunks_vec.chunk_id`.**

É o que mantém as três tabelas alinhadas sem código de sincronização: inserir é
escrever o mesmo id nas três, apagar é três `DELETE` pelo mesmo id. Toda
escrita acontece numa transação, então não existe trecho que esteja em duas
tabelas e falte na terceira.

Vale a pena enunciar isso aqui porque é o que o `reconcile` (spec 08) verifica,
e é a primeira coisa a suspeitar quando a busca devolver resultado estranho.

## Identidade: provedor, modelo e dimensão

Com embeddings por API (ADR 012), dimensão igual não basta: dois modelos de
1024 dimensões geram vetores que não se comparam. O índice guarda a
**identidade** de quem gerou os vetores — provedor, modelo e dimensão — e:

- `chunks_vec` é criada preguiçosamente, na primeira abertura com identidade,
  porque só então a dimensão é conhecida;
- a identidade fica em `meta.provider`, `meta.model` e `meta.dim`;
- abrir o índice com qualquer um dos três diferente é erro, com a mensagem
  dizendo para rodar `brain index --rebuild` ou voltar a configuração. Nunca
  uma reconstrução silenciosa: reindexar um vault grande custa tempo e, com
  API, dinheiro, e deve ser escolha de quem usa.

Esquema mais novo que o desta versão (`meta.schema_version`) também é erro.

Comandos que só leem (como `status` num índice vazio) abrem sem dimensão e
funcionam sem a tabela vetorial.

## Operações

Classe `BrainIndex` em `src/db.ts`; erros são `IndexError` com `kind`.

| Método | O que faz |
|---|---|
| `BrainIndex.open(path, identity?)` | abre, carrega extensão, migra, confere ou grava a identidade |
| `manifest()` | mapa `caminho -> linha`, para comparar com o disco |
| `upsertFile(file)` | grava no manifesto e **apaga os trechos antigos**, devolvendo o id |
| `insertChunks(fileId, chunks, embeddings)` | valida contagem e dimensão, depois insere nas três tabelas |
| `dropFile(fileId)` | apaga a nota e tudo derivado dela |
| `counts()` | contagem das quatro tabelas, usado por `status` e `reconcile` |
| `chunkIds()` | ids de cada tabela, para conferir o invariante |
| `transaction(fn)` | agrupa operações; aninhada, vira savepoint |
| `matchText(q)`, `nearest(v, k)` | consultas cruas ao FTS5 e ao vec0, base da spec 06 |

Os vetores chegam normalizados do embedder, então a distância L2 do `vec0`
ordena igual ao cosseno.

`upsertFile` apagar os trechos antigos não é efeito colateral escondido: é o
que torna reindexar uma nota uma operação só, sem janela em que a nota esteja
no manifesto com trechos velhos.

## `brain status`

Imprime: caminho do vault, provedor, modelo e dimensão (e se a configuração
atual pede outros), contagem de notas e trechos,
tamanho do índice, quando foi a última indexação e **quantas notas mudaram no
disco desde então**.

"Mudou" é mtime ou tamanho diferente do manifesto, além de notas novas e
removidas; conferir o hash fica para o `brain index`. `status` nunca cria o
arquivo de índice.

Esse último número é o que torna visível a limitação da
[ADR 009](../adr/009-reconciliacao-sob-demanda.md): a busca responde pela
última indexação, não pelo disco.

## Critérios de aceite

- Abrir um caminho inexistente cria o arquivo e o diretório.
- Abrir duas vezes não duplica tabela nem perde dado.
- `insert_chunks` com contagens diferentes de trechos e vetores levanta erro
  antes de escrever qualquer coisa.
- `drop_file` deixa as quatro contagens coerentes.
- Reabrir com provedor, modelo ou dimensão diferente levanta erro citando
  `--rebuild`.
- `status` funciona num índice recém-criado e vazio.

## Testes

Banco em arquivo temporário e `HashEmbedder`. Inserir, apagar e conferir que as
contagens das três tabelas batem a cada passo. Teste explícito do invariante:
depois de uma sequência de inserções e exclusões, o conjunto de ids em
`chunks`, `chunks_fts` e `chunks_vec` é idêntico.
