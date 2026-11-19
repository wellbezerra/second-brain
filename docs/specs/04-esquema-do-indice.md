# Spec 04 — Esquema do índice

**Commit:** `feat: esquema do índice em SQLite com FTS5 e sqlite-vec`
**Depende de:** [01](01-esqueleto-e-configuracao.md)
**Decisão de referência:** [ADR 004](../adr/004-sqlite-unico-para-o-indice.md),
[ADR 007](../adr/007-indice-dentro-do-vault.md)

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

A extensão `sqlite-vec` é carregada logo após abrir, e a carga de extensões é
desabilitada em seguida. Se o Python não permitir carregar extensões, a
mensagem precisa dizer isso e apontar o `brain doctor`, porque é uma limitação
do interpretador e não algo que o projeto resolva sozinho.

## Tabelas

```sql
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- chaves: schema_version, dim, model, last_index_at

CREATE TABLE files (
    id         INTEGER PRIMARY KEY,
    path       TEXT    NOT NULL UNIQUE,   -- relativo à raiz do vault
    hash       TEXT    NOT NULL,          -- sha256 do conteúdo
    mtime      REAL    NOT NULL,
    size       INTEGER NOT NULL,
    title      TEXT,
    indexed_at REAL    NOT NULL
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

## Dimensão

`chunks_vec` só pode nascer quando a dimensão é conhecida, e a dimensão vem do
modelo. Então:

- a tabela é criada preguiçosamente, na primeira indexação;
- a dimensão fica em `meta.dim`;
- abrir o índice com um modelo de dimensão diferente é erro, com a mensagem
  dizendo para rodar `brain index --rebuild`. Nunca uma reconstrução
  silenciosa: reindexar um vault grande é caro e deve ser escolha de quem usa.

Comandos que só leem (como `status` num índice vazio) abrem sem dimensão e
funcionam sem a tabela vetorial.

## Operações

| Função | O que faz |
|---|---|
| `connect(path, dim=None)` | abre, carrega extensão, migra |
| `manifest(conn)` | mapa `caminho -> linha`, para comparar com o disco |
| `upsert_file(...)` | grava no manifesto e **apaga os trechos antigos**, devolvendo o id |
| `insert_chunks(conn, file_id, chunks, embeddings)` | insere nas três tabelas |
| `drop_file(conn, file_id)` | apaga a nota e tudo derivado dela |
| `counts(conn)` | contagem das quatro tabelas, usado por `status` e `reconcile` |

`upsert_file` apagar os trechos antigos não é efeito colateral escondido: é o
que torna reindexar uma nota uma operação só, sem janela em que a nota esteja
no manifesto com trechos velhos.

## `brain status`

Imprime: caminho do vault, modelo e dimensão, contagem de notas e trechos,
tamanho do índice, quando foi a última indexação e **quantas notas mudaram no
disco desde então**.

Esse último número é o que torna visível a limitação da
[ADR 009](../adr/009-reconciliacao-sob-demanda.md): a busca responde pela
última indexação, não pelo disco.

## Critérios de aceite

- Abrir um caminho inexistente cria o arquivo e o diretório.
- Abrir duas vezes não duplica tabela nem perde dado.
- `insert_chunks` com contagens diferentes de trechos e vetores levanta erro
  antes de escrever qualquer coisa.
- `drop_file` deixa as quatro contagens coerentes.
- Reabrir com dimensão diferente levanta erro citando `--rebuild`.
- `status` funciona num índice recém-criado e vazio.

## Testes

Banco em arquivo temporário e `HashEmbedder`. Inserir, apagar e conferir que as
contagens das três tabelas batem a cada passo. Teste explícito do invariante:
depois de uma sequência de inserções e exclusões, o conjunto de ids em
`chunks`, `chunks_fts` e `chunks_vec` é idêntico.
