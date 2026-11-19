# Spec 03 — Embeddings locais

**Commit:** `feat: embeddings locais via Ollama`
**Depende de:** [01](01-esqueleto-e-configuracao.md)
**Decisão de referência:** [ADR 003](../adr/003-embeddings-locais-com-ollama.md)

## Objetivo

Transformar uma lista de textos numa lista de vetores, falando com o Ollama em
localhost. Junto disso, um embedder falso que permita testar todo o resto do
projeto sem Ollama instalado.

## Escopo

**Entra:** protocolo `Embedder`, cliente Ollama, embedder determinístico para
testes, diagnóstico (`brain doctor`).

**Fica de fora:** persistir vetor (spec 04), decidir o que embeddar (spec 05).

## O protocolo

```ts
interface Embedder {
  embed(texts: readonly string[]): Promise<number[][]>;
  health(): Promise<string>;      // "" quando está tudo certo
  readonly dim: number | undefined; // undefined até o primeiro embedding
  dimension(): Promise<number>;   // descobre a dimensão se ainda não souber
}
```

Em `src/embed.ts`, junto com `OllamaEmbedder`, `EmbedError` (com um `kind`
por situação da tabela de erros) e `normalize`. O `HashEmbedder` fica em
`src/hash-embedder.ts`.

Todo o resto do projeto depende deste protocolo, nunca do Ollama diretamente.
É o que permite trocar por uma API externa depois sem tocar no indexador, e o
que torna os testes independentes de rede.

## `OllamaEmbedder`

Fala com `POST /api/embed`, em lotes de 32 textos. Instalações antigas só têm
`/api/embeddings`, um texto por chamada — um 404 no primeiro endpoint cai para
o segundo automaticamente, e a instância lembra disso nas chamadas seguintes.

Cuidado: o Ollama atual também responde 404 quando o **modelo** não existe,
com `{"error": "model \"x\" not found, try pulling it first"}`. Esse 404 vira
a mensagem de modelo não baixado, não o fallback.

**Normalização.** Todo vetor sai com norma 1. Com isso a distância euclidiana
ordena igual ao cosseno, e eu não dependo de a extensão vetorial aceitar
`distance_metric=cosine`. Vetor de norma zero passa sem alteração em vez de
dividir por zero.

**Dimensão.** Não é configurada. É descoberta no primeiro embedding e
memorizada na instância.

**Timeout.** 120s para responder (`AbortSignal.timeout`). Primeira chamada
depois de `ollama serve` carrega o modelo na memória e é lenta. O `fetch`
nativo não separa timeout de conexão sem trazer o `undici` como dependência;
em localhost, Ollama fora do ar recusa a conexão na hora, então os 5s de
conexão previstos não fazem falta.

## `HashEmbedder`

Embedder determinístico, sem rede, para os testes: projeta cada token numa
dimensão por hash e normaliza. Não entende semântica, mas é consistente e
textos com palavras em comum ficam próximos — suficiente para exercitar
indexação, busca e fusão.

Precisa de dimensão baixa (64) e de hash estável entre execuções: o índice de
cada palavra sai dos 4 primeiros bytes do SHA-256 dela (`node:crypto`). As
palavras são comparadas sem caixa e sem acento, como o FTS5 com
`remove_diacritics`. Um teste fixa o vetor de um texto de referência; se ele
mudar, o algoritmo mudou.

## Erros, em português

O modo de falha mais provável é operacional, não de código. Cada um tem
mensagem própria:

| Situação | Mensagem |
|---|---|
| Ollama não responde | `não consegui falar com o Ollama em <url>. Ele está rodando? (ollama serve)` |
| Modelo não baixado | `o modelo '<m>' não está baixado. Rode: ollama pull <m>` |
| Resposta com contagem errada | `o Ollama devolveu N vetores para M textos` |
| Timeout | `o Ollama não respondeu em 120s. Modelo grande demais para esta máquina?` |

## `brain doctor`

Comando de diagnóstico que verifica, em ordem, e imprime um `✓` ou `✗` por
item: Node e versão (24 ou mais); Ollama respondendo; modelo configurado
disponível; dimensão que o modelo gera; vault configurado e existente.
Um item que depende de outro que falhou é marcado `–` (pulado), não `✗`.
Sai com código 3 se algum item falhar (tabela da spec 10).

Os itens de SQLite com FTS5 e `sqlite-vec` carregando entram na spec 04,
junto com a dependência `better-sqlite3`: antes dela não há o que verificar.

A lógica (`src/doctor.ts`) devolve a lista de verificações; quem imprime é a
CLI. Para isso a configuração ganhou `loadSettings`, que aplica a mesma
precedência de `loadConfig` sem exigir vault.

Existe porque todos esses são pré-requisitos externos, e descobrir qual deles
falhou no meio de uma indexação de 2.000 notas é pior do que ter um comando
que responde isso em dois segundos.

## Critérios de aceite

- `embed([])` devolve `[]` sem chamar a rede.
- Lote maior que 32 é dividido e devolve na ordem de entrada.
- Todo vetor devolvido tem norma 1 (tolerância 1e-6).
- 404 em `/api/embed` cai para `/api/embeddings` e devolve o mesmo formato.
- Ollama fora do ar produz a mensagem orientada, não um `TypeError: fetch failed`.
- `HashEmbedder` dá o mesmo vetor para o mesmo texto em processos diferentes.
- `brain doctor` roda e relata sem o Ollama, marcando só aquele item como falho.

## Testes

`fetch` falso, injetado no construtor, cobrindo: lote simples, lote
dividido, fallback por 404, erro de conexão, resposta com contagem errada,
resposta vazia. Nenhum teste da suíte pode exigir Ollama rodando.
