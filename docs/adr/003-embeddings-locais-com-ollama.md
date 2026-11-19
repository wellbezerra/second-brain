# ADR 003 — Embeddings locais via Ollama

**Status:** superada por [012](012-embeddings-por-api-com-provedor-configuravel.md) · 2026-11-19

## Contexto

A busca por significado precisa de embeddings. O projeto original usa Workers AI
com `bge-m3` (1024 dimensões), cobrado por neurons. Preciso de um equivalente
local.

## Decisão

Os embeddings são gerados pelo Ollama rodando em `127.0.0.1:11434`, com
`bge-m3` como modelo padrão.

O modelo é configurável. A dimensão **não** é configurada: vem do primeiro
vetor gerado e fica gravada no índice.

## Alternativas consideradas

**API externa (OpenAI, Voyage, Cohere).** Rejeitada. A qualidade do embedding
seria melhor, mas manda o conteúdo das minhas notas para fora, custa por uso e
quebra com a máquina offline. Para notas pessoais, o ganho de qualidade não
paga esses três preços.

**Plugin Smart Connections do Obsidian.** Rejeitada. Eu consumiria o índice do
plugin em vez de construir o meu. Menos código, mas o formato do índice é
decisão de terceiro e pode mudar sem aviso, e eu perderia o controle sobre
chunking e sobre a busca híbrida.

**sentence-transformers em processo.** Rejeitada. Traria PyTorch como
dependência, o que é pesado demais para uma CLI que precisa iniciar rápido. O
Ollama mantém o modelo carregado entre chamadas, o que deixa a CLI leve.

## Consequências

- Custo zero e nenhum dado saindo da máquina.
- O Ollama vira pré-requisito. A CLI precisa detectar que ele não está rodando
  ou que o modelo não foi baixado, e dizer isso em português claro em vez de
  estourar um erro de conexão.
- `bge-m3` é multilíngue, o que importa porque minhas notas misturam português,
  inglês e trechos de código.
- Trocar de modelo invalida o índice, porque a dimensão e o espaço vetorial
  mudam. O índice guarda a dimensão e recusa operar com um modelo incompatível,
  pedindo `--rebuild`.
- Os vetores são normalizados para norma 1 na saída do embedder. Com isso a
  distância euclidiana ordena igual ao cosseno, e eu não dependo de a extensão
  vetorial aceitar `distance_metric=cosine`.
