# Spec 05 — Indexação incremental

**Commit:** `feat: indexação incremental do vault`
**Depende de:** [02](02-leitura-do-vault-e-chunking.md),
[03](03-embeddings-locais.md), [04](04-esquema-do-indice.md)
**Decisão de referência:** [ADR 006](../adr/006-indexacao-incremental-por-hash.md)

## Objetivo

Ligar as três peças anteriores: ler o vault, descobrir o que mudou, gerar
embeddings só do que mudou e gravar. Este é o primeiro commit em que o projeto
faz algo útil de ponta a ponta.

## Escopo

**Entra:** detecção de mudança, orquestração do pipeline, `brain index`,
`--rebuild`.

**Fica de fora:** buscar (06), reparar divergência (08).

## Detecção de mudança

Para cada `.md` do vault, comparado com o manifesto:

| Caso | Detecção | Ação |
|---|---|---|
| nova | ausente do manifesto | indexa |
| alterada | hash difere | apaga trechos antigos, reindexa |
| inalterada | hash igual | pula |
| removida | no manifesto, ausente do disco | apaga trechos e linha |

**Atalho de `mtime`.** Se `mtime` e `size` batem com o manifesto, o arquivo não
é lido e o hash não é calculado. É otimização, nunca a decisão: qualquer
divergência em `mtime` ou `size` leva à leitura e ao hash, e é o hash que
decide. Isso cobre `touch` e restauração de backup, que mexem em `mtime` sem
mexer no conteúdo — nesses casos o arquivo é lido, o hash bate, e nada é
reindexado.

## Pipeline

```
varrer vault
   └─ para cada nota, classificar (nova / alterada / inalterada / removida)
         └─ para as que entram:
               ler → chunking → embeddings em lote → gravar em transação
   └─ para as removidas: drop_file
   └─ gravar meta.last_index_at
```

Os embeddings são o gargalo, então são pedidos em lote, atravessando a
fronteira de arquivos: 200 trechos de 15 notas viram um punhado de chamadas ao
Ollama, não 15.

**Transação por nota.** Cada nota é commitada ao terminar. Interromper com
Ctrl-C no meio de um vault grande deixa as notas já processadas indexadas e as
demais intocadas — rodar de novo retoma de onde parou, porque o manifesto já
registra o que foi feito. Uma transação única para o vault inteiro perderia
todo o trabalho a cada interrupção.

## Interface

```
brain index [--vault P] [--rebuild] [--dry-run] [--quiet] [--json]
```

- `--rebuild` — apaga o índice e reindexa tudo. É a saída para troca de modelo,
  mudança de parâmetro de chunking e qualquer suspeita de corrupção. Pede
  confirmação quando o índice tem mais de 100 notas, a menos que `--quiet`.
- `--dry-run` — classifica e relata, sem gerar embedding nem escrever.

Saída normal:

```
12 notas novas, 3 alteradas, 1 removida, 2.044 inalteradas
184 trechos indexados · 6,2s
```

Com `--json`, o mesmo em JSON, para consumo por script.

## Progresso e erro

Vault grande leva minutos na primeira indexação. Sem sinal de progresso, parece
travado — então o padrão mostra avanço (`47/312 notas`), suprimível com
`--quiet`.

Erro numa nota (ilegível, encoding quebrado) é registrado e a indexação segue.
O relatório final lista as falhas. Falha ao gerar embeddings é diferente:
significa que o Ollama caiu ou está sobrecarregado, e nesse caso o comando
para, porque insistir só produziria uma lista de erros idênticos.

## Critérios de aceite

- Primeira execução num vault de N notas indexa as N.
- Segunda execução sem alterações relata N inalteradas e **não chama o Ollama
  nenhuma vez**.
- Alterar uma nota reindexa só ela; a contagem total de trechos reflete a
  mudança.
- Apagar uma nota remove seus trechos das três tabelas.
- `touch` numa nota não altera o índice.
- Renomear uma nota aparece como uma remoção e uma inclusão (limitação
  conhecida, registrada na ADR 006).
- Ctrl-C no meio deixa o índice coerente, e a execução seguinte completa.
- `--rebuild` com modelo de outra dimensão funciona sem erro.

## Testes

Vault temporário manipulado pelo teste e `HashEmbedder` instrumentado para
contar chamadas.

O teste que mais importa é o da segunda execução: indexar, indexar de novo,
afirmar que o contador de chamadas ao embedder não subiu. É o que protege a
premissa de desempenho do projeto inteiro, e é o primeiro a quebrar se alguém
mexer na detecção de mudança.

Cobrir também: `touch` sem alteração de conteúdo; alteração que muda o tamanho;
alteração que mantém o tamanho (troca de um caractere por outro); nota apagada;
pasta inteira apagada.
