# ADR 012 — Embeddings por API, com provedor configurável

**Status:** aceita · 2026-11-19 · supera o [ADR 003](003-embeddings-locais-com-ollama.md)

## Contexto

O ADR 003 escolheu embeddings locais via Ollama. Antes da primeira indexação
real, a decisão mudou: por enquanto não vou rodar modelo local nesta máquina,
e já uso Claude, ChatGPT e Gemini no dia a dia.

Desses três, só OpenAI e Google têm API de embedding. A Anthropic não oferece
modelo de embedding próprio; a documentação dela indica a Voyage AI.

A interface `Embedder` (spec 03) já isolava o resto do projeto do provedor, e
o `HashEmbedder` já tirava a rede dos testes. A troca fica contida no módulo
de embeddings.

## Decisão

Os embeddings vêm de uma API externa, escolhida por configuração:

| Provedor | Modelo padrão | Dimensão | Chave |
|---|---|---|---|
| `openai` (padrão) | `text-embedding-3-small` | 1536 | `OPENAI_API_KEY` |
| `gemini` | `gemini-embedding-2` | 3072 | `GEMINI_API_KEY` |
| `voyage` | `voyage-4` | 1024 | `VOYAGE_API_KEY` |
| `ollama` | `bge-m3` | 1024 | — (local) |

O provedor vem de `--provider`, `BRAIN_PROVIDER` ou do arquivo de
configuração, com a mesma precedência dos outros campos. O modelo continua
configurável; sem ele, vale o padrão do provedor.

**Chave de API só por variável de ambiente.** Nunca no `config.json`, que é
um arquivo comum em `~/.config` e acaba copiado, versionado ou exibido.

O Ollama continua disponível como provedor, só deixa de ser o padrão.

## Alternativas consideradas

**Manter o Ollama como padrão.** Rejeitada por ora: exige instalar e manter
um runtime de modelo que não vou usar agora. Fica como opção para quando
fizer sentido de novo.

**Um provedor só, fixo.** Rejeitada. Os três custam pouco para manter atrás
da mesma interface, e a escolha entre eles é exatamente o tipo de coisa que o
`brain eval` (spec 10) deve decidir com número, não com palpite.

**SDKs oficiais (`openai`, `@google/genai`, `voyageai`).** Rejeitada. Cada
provedor é um `POST` com JSON; três SDKs seriam três dependências e três
estilos de erro para traduzir. `fetch` nativo basta ([ADR 011](011-node-typescript-como-runtime.md)).

**Pedir embedding ao Claude via Messages API.** Rejeitada. Não existe; gerar
"vetores" com um modelo de texto seria lento, caro e sem garantia nenhuma.

## Consequências

- **O conteúdo das notas sai da máquina.** Na indexação, o texto de cada
  trecho (com o caminho de headings) vai para o provedor; na busca, a
  consulta. A SPEC deixa de prometer "nada sai da máquina" e o `brain doctor`
  diz para onde os trechos vão.
- **Custo deixa de ser zero**, embora pequeno: indexar 2.000 notas é da ordem
  de alguns milhões de tokens uma vez, e a indexação incremental (ADR 006)
  só reenvia o que mudou.
- **Sem rede, a busca por significado para.** A busca por palavra-chave
  (FTS5) continua funcionando, e a busca híbrida (spec 06) precisa degradar
  para ela em vez de falhar.
- **Trocar de provedor ou de modelo invalida o índice**, como já previa o
  ADR 003: o índice grava provedor, modelo e dimensão, e recusa operar com
  outro, pedindo `--rebuild`.
- **Documento e consulta são embeddados de formas diferentes** em Voyage
  (`input_type`) e Gemini (prefixo `task: search result | query:`). A
  interface `Embedder` ganha o propósito (`document` ou `query`) como
  parâmetro; quem não distingue, ignora.
- **APIs remotas falham de jeitos novos:** chave ausente ou recusada, limite
  de uso (429), indisponibilidade (5xx). Cada um tem mensagem própria em
  português, e 429/5xx são tentados de novo algumas vezes antes de desistir.
- Continua valendo: **nenhum teste exige rede**. Os clientes recebem `fetch`
  injetado, e o resto da suíte usa o `HashEmbedder`.
