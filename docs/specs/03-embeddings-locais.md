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

```python
class Embedder(Protocol):
    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...
    def health(self) -> str: ...   # "" quando está tudo certo
    @property
    def dim(self) -> int: ...
```

Todo o resto do projeto depende deste protocolo, nunca do Ollama diretamente.
É o que permite trocar por uma API externa depois sem tocar no indexador, e o
que torna os testes independentes de rede.

## `OllamaEmbedder`

Fala com `POST /api/embed`, em lotes de 32 textos. Instalações antigas só têm
`/api/embeddings`, um texto por chamada — um 404 no primeiro endpoint cai para
o segundo automaticamente.

**Normalização.** Todo vetor sai com norma 1. Com isso a distância euclidiana
ordena igual ao cosseno, e eu não dependo de a extensão vetorial aceitar
`distance_metric=cosine`. Vetor de norma zero passa sem alteração em vez de
dividir por zero.

**Dimensão.** Não é configurada. É descoberta no primeiro embedding e
memorizada na instância.

**Timeout.** 5s para conectar, 120s para responder. Primeira chamada depois de
`ollama serve` carrega o modelo na memória e é lenta.

## `HashEmbedder`

Embedder determinístico, sem rede, para os testes: projeta cada token numa
dimensão por hash e normaliza. Não entende semântica, mas é consistente e
textos com palavras em comum ficam próximos — suficiente para exercitar
indexação, busca e fusão.

Precisa de dimensão baixa (64) e de hash estável entre execuções, o que em
Python significa não usar `hash()` de `str` com `PYTHONHASHSEED` aleatório;
usar `hashlib` e derivar o índice dele.

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
item: Python e versão; SQLite com FTS5; SQLite com carga de extensão
habilitada; `sqlite-vec` importável; Ollama respondendo; modelo configurado
disponível; dimensão que o modelo gera; vault configurado e existente.

Existe porque todos esses são pré-requisitos externos, e descobrir qual deles
falhou no meio de uma indexação de 2.000 notas é pior do que ter um comando
que responde isso em dois segundos.

## Critérios de aceite

- `embed([])` devolve `[]` sem chamar a rede.
- Lote maior que 32 é dividido e devolve na ordem de entrada.
- Todo vetor devolvido tem norma 1 (tolerância 1e-6).
- 404 em `/api/embed` cai para `/api/embeddings` e devolve o mesmo formato.
- Ollama fora do ar produz a mensagem orientada, não um traceback de `httpx`.
- `HashEmbedder` dá o mesmo vetor para o mesmo texto em processos diferentes.
- `brain doctor` roda e relata sem o Ollama, marcando só aquele item como falho.

## Testes

Cliente HTTP falso (`httpx.MockTransport`) cobrindo: lote simples, lote
dividido, fallback por 404, erro de conexão, resposta com contagem errada,
resposta vazia. Nenhum teste da suíte pode exigir Ollama rodando.
