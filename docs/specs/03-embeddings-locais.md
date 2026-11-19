# Spec 03 — Embeddings

**Commits:** `feat: embeddings locais via Ollama` e, depois,
`feat: embeddings por API (OpenAI, Gemini e Voyage)`
**Depende de:** [01](01-esqueleto-e-configuracao.md)
**Decisões de referência:** [ADR 012](../adr/012-embeddings-por-api-com-provedor-configuravel.md),
que supera o [ADR 003](../adr/003-embeddings-locais-com-ollama.md)

## Objetivo

Transformar uma lista de textos numa lista de vetores, falando com o provedor
de embeddings configurado — OpenAI, Gemini, Voyage ou Ollama. Junto disso, um
embedder falso que permita testar todo o resto do projeto sem rede.

## Escopo

**Entra:** protocolo `Embedder`, um cliente por provedor, escolha do
provedor pela configuração, embedder determinístico para testes, diagnóstico
(`brain doctor`).

**Fica de fora:** persistir vetor (spec 04), decidir o que embeddar (spec 05).

## O protocolo

```ts
type EmbedPurpose = "document" | "query";

interface Embedder {
  readonly provider: string;      // "openai", "gemini", "voyage", "ollama", "hash"
  readonly model: string;
  embed(texts: readonly string[], purpose?: EmbedPurpose): Promise<number[][]>;
  health(): Promise<string>;      // "" quando está tudo certo
  readonly dim: number | undefined; // undefined até o primeiro embedding
  dimension(): Promise<number>;   // descobre a dimensão se ainda não souber
}
```

`purpose` é `"document"` por padrão (indexação); a busca passa `"query"`.
Voyage e Gemini embeddam os dois de forma diferente; OpenAI e Ollama ignoram.

Em `src/embed.ts` ficam a interface, `EmbedError` (com um `kind` por
situação da tabela de erros), `normalize` e `createEmbedder`, que escolhe o
cliente pela configuração. Os clientes ficam em `src/embedders/`, um arquivo
por provedor, com o que é comum a eles (timeout, erros HTTP, novas
tentativas) em `src/embedders/http.ts`. O `HashEmbedder` fica em
`src/hash-embedder.ts`.

Todo o resto do projeto depende deste protocolo, nunca de um provedor. É o que
torna a troca de provedor uma linha de configuração, e os testes
independentes de rede.

## Provedores

| `provider` | Endpoint | Modelo padrão | Dim. | Chave | Lote |
|---|---|---|---|---|---|
| `openai` (padrão) | `POST https://api.openai.com/v1/embeddings` | `text-embedding-3-small` | 1536 | `OPENAI_API_KEY` | 100 |
| `gemini` | `POST …/v1beta/models/<m>:batchEmbedContents` | `gemini-embedding-2` | 3072 | `GEMINI_API_KEY` | 100 |
| `voyage` | `POST https://ai.mongodb.com/v1/embeddings` | `voyage-4` | 1024 | `VOYAGE_API_KEY` | 100 |
| `ollama` | `POST <ollama_url>/api/embed` | `bge-m3` | 1024 | — | 32 |

- **Escolha:** `--provider` > `BRAIN_PROVIDER` > campo `provider` do
  `config.json` > `openai`. O modelo segue a mesma precedência; sem ele, vale
  o padrão do provedor escolhido.
- **Chave:** só por variável de ambiente. Nunca é gravada no `config.json` nem
  aparece em mensagem de erro. Sem a chave, o erro diz qual variável definir.
- **Gemini:** `gemini-embedding-2` não aceita `taskType`; o propósito vai no
  texto, como a documentação do Google pede: `task: search result | query: …`
  para consulta e `title: none | text: …` para documento. Modelos anteriores
  (`gemini-embedding-001`) recebem `taskType` `RETRIEVAL_QUERY` /
  `RETRIEVAL_DOCUMENT`. Chave no cabeçalho `x-goog-api-key`.
- **Voyage:** `input_type` `query` / `document`. Chaves da plataforma antiga da
  Voyage usam `https://api.voyageai.com/v1`; `VOYAGE_BASE_URL` troca o
  endereço.
- **Novas tentativas:** 429 e 5xx são tentados mais duas vezes, esperando 1s e
  depois 2s, ou o que o `retry-after` pedir (até 30s). Depois disso, erro.
- **Timeout:** 120s por requisição, como no Ollama.
- Todos os vetores passam por `normalize`, mesmo quando o provedor já
  normaliza: custa nada e mantém a garantia independente do provedor.

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
| Chave ausente (API) | `defina a variável OPENAI_API_KEY com a sua chave da OpenAI` |
| Chave recusada (401/403) | `a OpenAI recusou a chave em OPENAI_API_KEY. Confira se ela está certa e ativa` |
| Modelo inexistente (404) | `a OpenAI não conhece o modelo 'x'. Confira --model` |
| Limite de uso (429) | `a OpenAI limitou as requisições (429) mesmo depois de 3 tentativas. Espere um pouco e rode de novo` |
| Fora do ar (5xx / rede) | `não consegui falar com a OpenAI (api.openai.com). Verifique a conexão` |

Os textos dos outros provedores são os mesmos, trocando o nome.

## `brain doctor`

Comando de diagnóstico que verifica, em ordem, e imprime um `✓` ou `✗` por
item: Node e versão (24 ou mais); provedor configurado respondendo, com a
chave e o modelo aceitos (para o Ollama, também se o modelo está baixado);
dimensão que o modelo gera; vault configurado e existente. O item do
provedor diz para onde os trechos vão (`api.openai.com`, por exemplo), para
que isso nunca seja surpresa.

Para os provedores remotos, verificar custa um embedding de uma palavra — o
único jeito de saber se a chave e o modelo funcionam.
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
- Com `provider: openai` e sem `OPENAI_API_KEY`, nada é enviado e a mensagem
  diz qual variável definir.
- A chave nunca aparece em mensagem de erro, mesmo que o provedor a devolva.
- Consulta e documento chegam ao Gemini e à Voyage no formato de cada um.
- 429 seguido de 200 devolve os vetores; três 429 seguidos dão o erro de limite.

## Testes

`fetch` falso, injetado no construtor, cobrindo: lote simples, lote
dividido, fallback por 404, erro de conexão, resposta com contagem errada,
resposta vazia. Nenhum teste da suíte pode exigir Ollama rodando.
