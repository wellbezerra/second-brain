# ADR 009 — Reconciliação sob demanda, sem daemon

**Status:** aceita · 2026-11-19

## Contexto

O Obsidian escreve no vault sem avisar o Brain. Entre uma indexação e outra, o
índice fica desatualizado. O projeto original resolve isso com uma fila de
indexação e um workflow de reconciliação rodando todo dia às 04:00 UTC.

Preciso decidir como o índice se mantém próximo do disco.

## Decisão

Nada roda sozinho. Dois comandos explícitos cobrem o assunto:

- **`brain index`** — passada incremental. Compara o disco com o manifesto e
  aplica as diferenças. É o comando do dia a dia, barato o bastante para rodar
  com frequência.
- **`brain reconcile`** — verificação profunda. Compara as três fontes (disco,
  manifesto e tabelas de trechos) e aponta toda divergência: trecho órfão sem
  arquivo, arquivo no manifesto sem trecho, desalinhamento entre `chunks`,
  `chunks_fts` e `chunks_vec`, hash divergente. Por padrão só relata;
  com `--fix`, corrige.

Agendar `brain index` no cron ou no launchd fica a critério de quem usa, e é
documentado — mas não é o projeto que instala isso.

## Alternativas consideradas

**Watcher do sistema de arquivos.** Rejeitada. Exige um processo residente, que
é justamente o que a [ADR 001](001-cli-local-em-vez-de-mcp.md) eliminou. Some
com isso toda uma classe de problema: processo morto sem ninguém notar, evento
perdido, duplicado ou fora de ordem, e o comportamento irregular de watchers em
pastas sincronizadas por iCloud ou Dropbox.

**Indexar automaticamente antes de cada busca.** Rejeitada como padrão, porque
torna a latência da busca imprevisível: normalmente instantânea, de vez em
quando quinze segundos. Fica disponível como `brain search --fresh` para quando
eu quiser a garantia.

**Fila assíncrona, como no original.** Rejeitada. A fila existe lá para tirar a
indexação do caminho crítico de uma escrita remota concorrente. Aqui a escrita
é local e sequencial, e o custo da fila seria consistência eventual sem nenhum
ganho em troca.

## Consequências

- A busca é consistente com a **última indexação**, não com o disco. Essa é a
  limitação central do desenho e precisa estar visível: o `brain status` mostra
  quando foi a última indexação e quantas notas mudaram desde então.
- Sem processo residente, sem gerenciamento de ciclo de vida, sem logs de
  daemon para investigar.
- `reconcile` separa diagnóstico de correção. Quero poder olhar a divergência
  antes de mandar o programa mexer no índice — quando o índice está estranho, a
  causa interessa mais que o conserto.
- Diferente do original, não há reconciliação periódica obrigatória, porque não
  há fila que possa perder mensagem. A deriva aqui tem uma causa só: edição
  fora da CLI.
