# ADR 004 — Um SQLite para manifesto, FTS5 e vetores

**Status:** aceita · 2026-11-19

## Contexto

O índice precisa guardar três coisas: o manifesto de arquivos já processados,
um índice de texto para busca por palavra-chave e um índice vetorial para busca
por significado. No projeto original isso eram três serviços da Cloudflare —
D1, FTS dentro do D1 e Vectorize.

## Decisão

Tudo num único arquivo SQLite, com FTS5 (já embutido no SQLite) para texto e a
extensão [`sqlite-vec`](https://github.com/asg017/sqlite-vec) para vetores.

As tabelas `chunks`, `chunks_fts` e `chunks_vec` compartilham o mesmo `rowid`,
que é o `chunks.id`. Isso mantém as três alinhadas por construção e torna a
exclusão de um trecho uma operação de três `DELETE` pelo mesmo id.

## Alternativas consideradas

**Chroma, LanceDB ou Qdrant.** Rejeitadas. Todos resolvem o lado vetorial bem,
mas nenhum resolve o lado de palavra-chave, então eu teria dois armazenamentos
para manter em sincronia — e sincronizar dois bancos é exatamente a classe de
bug que eu quero evitar. Qdrant ainda pediria um processo rodando.

**Índice vetorial em memória, reconstruído a cada chamada.** Rejeitada. Para
2.000 notas até funcionaria, mas pagaria a leitura completa do vault em toda
busca, o que mata o alvo de latência.

**FAISS em arquivo + SQLite para o resto.** Rejeitada. Dois arquivos que podem
divergir, e FAISS não tem exclusão barata de um vetor individual.

## Consequências

- Uma transação cobre as três tabelas. Ou o trecho entra nos três índices, ou
  não entra em nenhum. Não existe estado parcial.
- Um arquivo para fazer backup, copiar ou apagar.
- `sqlite-vec` faz varredura linear (brute force), sem índice aproximado. Para
  a escala alvo — dezenas de milhares de trechos — isso é rápido o bastante e
  tem a vantagem de dar recall exato. Se o vault crescer a ponto de doer, a
  saída é particionar por pasta ou trocar a extensão, não reescrever o resto.
- O Python precisa conseguir carregar extensões do SQLite
  (`enable_load_extension`). Em alguns Python de sistema no macOS isso vem
  desabilitado; a instalação precisa verificar isso e avisar cedo.
- FTS5 é configurado com `remove_diacritics 2`, para que "vetorizacao" encontre
  "vetorização".
