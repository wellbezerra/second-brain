# Spec 10 — Empacotamento, instalação e avaliação da busca

**Commit:** `feat: empacotamento, instalação e avaliação da busca`
**Depende de:** todas as anteriores.

## Objetivo

Fechar o projeto em algo instalável numa máquina nova, e criar a forma de
medir se uma mudança na busca melhorou ou piorou o resultado.

A segunda parte é a que importa mais no longo prazo. Sem medida, ajustar
chunking, modelo ou parâmetro de fusão vira opinião.

## Escopo

**Entra:** instalação, README, coerência da CLI, conjunto de consultas de
referência, `brain eval`, CI.

**Fica de fora:** publicar no PyPI, empacotar para Homebrew.

## Instalação

```sh
git clone <repo> && cd brain
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
brain doctor
brain init --vault ~/Documentos/notas
brain index
```

O README precisa cobrir os três pré-requisitos que não são Python, porque são
onde a instalação costuma falhar:

- **Ollama** instalado, rodando, com o modelo baixado (`ollama pull bge-m3`).
- **SQLite com FTS5.** Vem por padrão, mas não em toda compilação.
- **Carga de extensão habilitada no Python.** O Python de sistema do macOS
  frequentemente vem sem isso, e `sqlite-vec` não carrega. A saída é um Python
  do Homebrew ou do pyenv. O `brain doctor` detecta e o README explica.

## Coerência da CLI

Até aqui cada feature acrescentou seu comando. Este commit passa o pente:

- toda saída estruturada aceita `--json`, com o mesmo formato de envelope;
- todo comando longo aceita `--quiet`;
- códigos de saída: `0` sucesso, `1` divergência ou nada encontrado, `2` erro
  de uso, `3` dependência externa faltando;
- mensagens de erro em português, dizendo o que fazer, não só o que falhou;
- `brain --help` lista os comandos agrupados por propósito, não em ordem
  alfabética.

## Avaliação da busca

Um arquivo `eval/consultas.yaml` com consultas reais e os resultados esperados:

```yaml
- consulta: "por que não usamos uma fila"
  espera:
    - docs/adr/009-reconciliacao-sob-demanda.md
  nao_espera:
    - Diario/2026-01-02.md

- consulta: "sqlite-vec cosseno"
  espera:
    - docs/adr/003-embeddings-locais-com-ollama.md
    - docs/adr/004-sqlite-unico-para-o-indice.md
```

`brain eval` roda as consultas contra um vault de referência e reporta
**recall@5** e **MRR**, por consulta e no agregado. Com `--compare`, mostra a
diferença contra uma execução anterior salva.

O conjunto começa pequeno — vinte consultas bastam para pegar regressão
grosseira — e cresce toda vez que eu notar uma busca que deveria ter
funcionado e não funcionou. Essa é a disciplina que mantém o conjunto útil:
toda frustração com a busca vira uma linha no arquivo.

Isto é o que destrava o trabalho futuro. Com essa medida eu posso comparar
tamanho de chunk, modelo de embedding, `k` do RRF e peso do `heading` no BM25
com números em vez de impressão. Sem ela, cada ajuste é chute.

## CI

GitHub Actions rodando `pytest` e checagem de tipos em cada push.

A suíte inteira roda com `HashEmbedder` e não exige Ollama — o que foi um
requisito desde a [spec 03](03-embeddings-locais.md), e é o que permite ter CI.
`brain eval` precisa de modelo real, então roda à mão, não no CI.

## Critérios de aceite

- Instalação do zero num ambiente limpo segue o README sem passo implícito.
- `brain doctor` detecta corretamente Ollama ausente, modelo ausente e Python
  sem carga de extensão.
- `brain --help` é legível e agrupado.
- Todos os comandos respeitam a tabela de códigos de saída.
- `brain eval` roda e reporta recall@5 e MRR.
- CI passa num runner sem Ollama.

## Testes

- Teste de fumaça que percorre o fluxo inteiro num vault temporário: `init`,
  `save`, `index`, `search`, `reconcile`, `status`.
- Teste de que todo comando registrado aceita `--json` e `--quiet`.
- `brain eval` com um vault de referência minúsculo e consultas triviais,
  só para garantir que o cálculo das métricas está certo — a avaliação de
  qualidade de verdade é manual, com modelo real.
